//! Frame-driven D3D11 output. mpv renders into our texture; glass never asks
//! mpv or DWM for a screenshot. GPU readback uses three nonblocking tiny slots.
use crate::{
    glass::{Control, Ticket},
    mpv::Mpv,
    render::RenderContext,
};
use std::{
    sync::{Arc, Condvar, Mutex, mpsc},
    thread::JoinHandle,
    time::{Duration, Instant},
};
use windows::{
    Win32::{
        Foundation::{HMODULE, HWND},
        Graphics::{
            Direct3D::Fxc::{D3DCOMPILE_OPTIMIZATION_LEVEL3, D3DCompile},
            Direct3D::*,
            Direct3D11::*,
            Dxgi::Common::*,
            Dxgi::*,
        },
    },
    core::{Interface, PCSTR, Result as WinResult},
};

#[derive(Default)]
struct State {
    size: (u32, u32),
    visible: bool,
    wake: bool,
    stop: bool,
}
pub struct Host {
    hwnd: usize,
    state: Arc<(Mutex<State>, Condvar)>,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl Host {
    pub fn new(hwnd: usize, width: u32, height: u32) -> Arc<Self> {
        Arc::new(Self {
            hwnd,
            state: Arc::new((
                Mutex::new(State {
                    size: (width, height),
                    visible: true,
                    wake: true,
                    stop: false,
                }),
                Condvar::new(),
            )),
            worker: Mutex::new(None),
        })
    }
    pub fn resize(&self, width: u32, height: u32) {
        let mut s = self.state.0.lock().unwrap();
        s.size = (width, height);
        s.wake = true;
        self.state.1.notify_one();
    }
    pub fn visible(&self, visible: bool) {
        let mut s = self.state.0.lock().unwrap();
        if s.visible != visible {
            s.visible = visible;
            s.wake = true;
            self.state.1.notify_one();
        }
    }
    pub fn start(
        &self,
        mpv: Arc<Mpv>,
        glass: Control,
        on_error: impl Fn(String) + Send + 'static,
    ) -> Result<(), String> {
        let mut worker = self.worker.lock().unwrap();
        if worker.is_some() {
            return Ok(());
        }
        let state = self.state.clone();
        let hwnd = self.hwnd;
        let (ready, initialized) = mpsc::sync_channel(1);
        let demand = state.clone();
        glass.on_demand(Arc::new(move || {
            let mut s = demand.0.lock().unwrap();
            s.wake = true;
            demand.1.notify_one();
        }));
        *worker = Some(
            std::thread::Builder::new()
                .name("navigator-d3d11".into())
                .spawn(move || {
                    let mut started = false;
                    let result = unsafe { run(hwnd, state, mpv, glass, &ready, &mut started) };
                    if let Err(e) = result {
                        let _ = ready.send(Err(e.to_string()));
                        log::error!("Native D3D11 output: {e}");
                        if started {
                            on_error(e.to_string());
                        }
                    }
                })
                .map_err(|e| e.to_string())?,
        );
        initialized.recv().map_err(|e| e.to_string())?
    }
    pub fn begin_shutdown(&self) {
        {
            let mut s = self.state.0.lock().unwrap();
            s.stop = true;
            s.wake = true;
            self.state.1.notify_one();
        }
    }
    pub fn finished(&self) -> bool {
        self.worker
            .lock()
            .unwrap()
            .as_ref()
            .is_none_or(|w| w.is_finished())
    }
    pub fn shutdown(&self) {
        self.begin_shutdown();
        if let Some(worker) = self.worker.lock().unwrap().take() {
            let _ = worker.join();
        }
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct Pending {
    ticket: Ticket,
    sequence: u64,
    started: Instant,
}
struct Slot {
    texture: ID3D11Texture2D,
    pending: Option<Pending>,
}
struct GlassGpu {
    size: (u32, u32),
    target: ID3D11Texture2D,
    rtv: ID3D11RenderTargetView,
    vertex: ID3D11VertexShader,
    pixel: ID3D11PixelShader,
    sampler: ID3D11SamplerState,
    footprint: ID3D11Buffer,
    slots: Vec<Slot>,
    sequence: u64,
    delivered: u64,
}
unsafe fn compile(
    source: &str,
    entry: &std::ffi::CStr,
    target: &std::ffi::CStr,
) -> WinResult<ID3DBlob> {
    let mut blob = None;
    let mut error = None;
    unsafe {
        D3DCompile(
            source.as_ptr().cast(),
            source.len(),
            PCSTR::null(),
            None,
            None,
            PCSTR(entry.as_ptr().cast()),
            PCSTR(target.as_ptr().cast()),
            D3DCOMPILE_OPTIMIZATION_LEVEL3,
            0,
            &mut blob,
            Some(&mut error),
        )
    }?;
    Ok(blob.unwrap())
}
unsafe fn texture(
    device: &ID3D11Device,
    size: (u32, u32),
    staging: bool,
) -> WinResult<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: size.0,
        Height: size.1,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: if staging {
            D3D11_USAGE_STAGING
        } else {
            D3D11_USAGE_DEFAULT
        },
        BindFlags: if staging {
            0
        } else {
            (D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE).0 as u32
        },
        CPUAccessFlags: if staging {
            D3D11_CPU_ACCESS_READ.0 as u32
        } else {
            0
        },
        MiscFlags: 0,
    };
    let mut result = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut result)) }?;
    Ok(result.unwrap())
}
impl GlassGpu {
    unsafe fn new(device: &ID3D11Device, size: (u32, u32)) -> WinResult<Self> {
        unsafe {
            let scale = (640.0 / size.0 as f64).min(360.0 / size.1 as f64).min(1.0);
            let size = (
                (size.0 as f64 * scale).round().max(1.0) as u32,
                (size.1 as f64 * scale).round().max(1.0) as u32,
            );
            let source = "Texture2D image:register(t0);SamplerState linearClamp:register(s0);struct V{float4 position:SV_Position;float2 uv:TEXCOORD0;};V vs(uint id:SV_VertexID){V o;o.uv=float2((id<<1)&2,id&2);o.position=float4(o.uv*float2(2,-2)+float2(-1,1),0,1);return o;}cbuffer SampleSize:register(b0){float4 footprint;}float4 ps(V input):SV_Target{float4 sum=0;[unroll]for(int y=0;y<4;y++){[unroll]for(int x=0;x<4;x++){sum+=image.SampleLevel(linearClamp,input.uv+(float2(x,y)*.25-.375)*footprint.xy,0);}}return (sum/16).bgra;}";
            let vs = compile(source, c"vs", c"vs_4_0")?;
            let ps = compile(source, c"ps", c"ps_4_0")?;
            let mut vertex = None;
            let mut pixel = None;
            device.CreateVertexShader(
                std::slice::from_raw_parts(vs.GetBufferPointer().cast(), vs.GetBufferSize()),
                None,
                Some(&mut vertex),
            )?;
            device.CreatePixelShader(
                std::slice::from_raw_parts(ps.GetBufferPointer().cast(), ps.GetBufferSize()),
                None,
                Some(&mut pixel),
            )?;
            let mut footprint = None;
            let values = [1.0f32 / size.0 as f32, 1.0f32 / size.1 as f32, 0.0, 0.0];
            device.CreateBuffer(
                &D3D11_BUFFER_DESC {
                    ByteWidth: 16,
                    Usage: D3D11_USAGE_DEFAULT,
                    BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                    ..Default::default()
                },
                Some(&D3D11_SUBRESOURCE_DATA {
                    pSysMem: values.as_ptr().cast(),
                    ..Default::default()
                }),
                Some(&mut footprint),
            )?;
            let target = texture(device, size, false)?;
            let mut rtv = None;
            device.CreateRenderTargetView(&target, None, Some(&mut rtv))?;
            let mut sampler = None;
            device.CreateSamplerState(
                &D3D11_SAMPLER_DESC {
                    Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                    AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                    MaxLOD: f32::MAX,
                    ComparisonFunc: D3D11_COMPARISON_NEVER,
                    ..Default::default()
                },
                Some(&mut sampler),
            )?;
            let mut slots = Vec::new();
            for _ in 0..3 {
                slots.push(Slot {
                    texture: texture(device, size, true)?,
                    pending: None,
                });
            }
            Ok(Self {
                size,
                target,
                rtv: rtv.unwrap(),
                vertex: vertex.unwrap(),
                pixel: pixel.unwrap(),
                sampler: sampler.unwrap(),
                footprint: footprint.unwrap(),
                slots,
                sequence: 0,
                delivered: 0,
            })
        }
    }
    fn pending(&self) -> bool {
        self.slots.iter().any(|s| s.pending.is_some())
    }
    unsafe fn resize(&mut self, device: &ID3D11Device, size: (u32, u32)) -> WinResult<()> {
        unsafe {
            let scale = (640.0 / size.0 as f64).min(360.0 / size.1 as f64).min(1.0);
            let size = (
                (size.0 as f64 * scale).round().max(1.0) as u32,
                (size.1 as f64 * scale).round().max(1.0) as u32,
            );
            for slot in &mut self.slots {
                slot.pending = None;
            }
            if self.size == size {
                return Ok(());
            }
            self.target = texture(device, size, false)?;
            let mut rtv = None;
            device.CreateRenderTargetView(&self.target, None, Some(&mut rtv))?;
            self.rtv = rtv.unwrap();
            for slot in &mut self.slots {
                slot.texture = texture(device, size, true)?;
            }
            self.size = size;
            Ok(())
        }
    }
    unsafe fn collect(&mut self, context: &ID3D11DeviceContext, glass: &Control) {
        unsafe {
            for slot in &mut self.slots {
                if slot.pending.is_none() {
                    continue;
                }
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                match context.Map(
                    &slot.texture,
                    0,
                    D3D11_MAP_READ,
                    D3D11_MAP_FLAG_DO_NOT_WAIT.0 as u32,
                    Some(&mut mapped),
                ) {
                    Ok(()) => {
                        let pending = slot.pending.take().unwrap();
                        if pending.sequence > self.delivered
                            && glass.ticket().as_ref() == Some(&pending.ticket)
                        {
                            let stride = self.size.0 as usize * 4;
                            let mut pixels = vec![0; stride * self.size.1 as usize];
                            for y in 0..self.size.1 as usize {
                                std::ptr::copy_nonoverlapping(
                                    mapped.pData.cast::<u8>().add(y * mapped.RowPitch as usize),
                                    pixels.as_mut_ptr().add(y * stride),
                                    stride,
                                );
                            }
                            self.delivered = pending.sequence;
                            glass.submit(
                                pending.ticket,
                                pixels,
                                self.size.0 as usize,
                                self.size.1 as usize,
                                stride,
                                pending.started,
                            );
                            log::trace!(
                                "glass GPU readback ready in {:.2} ms",
                                pending.started.elapsed().as_secs_f64() * 1000.0
                            );
                        }
                        context.Unmap(&slot.texture, 0);
                    }
                    Err(e) if e.code() == DXGI_ERROR_WAS_STILL_DRAWING => {}
                    Err(e) => {
                        log::warn!("Glass readback: {e}");
                        slot.pending = None;
                    }
                }
            }
        }
    }
    unsafe fn capture(
        &mut self,
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        source: &ID3D11Texture2D,
        ticket: Ticket,
    ) -> WinResult<bool> {
        unsafe {
            let Some(slot) = self.slots.iter_mut().find(|s| s.pending.is_none()) else {
                return Ok(false);
            };
            let mut srv = None;
            device.CreateShaderResourceView(source, None, Some(&mut srv))?;
            context.ClearState();
            context.OMSetRenderTargets(Some(&[Some(self.rtv.clone())]), None);
            context.RSSetViewports(Some(&[D3D11_VIEWPORT {
                Width: self.size.0 as f32,
                Height: self.size.1 as f32,
                MaxDepth: 1.0,
                ..Default::default()
            }]));
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&self.vertex, None);
            context.PSSetShader(&self.pixel, None);
            let footprint = [
                1.0f32 / self.size.0 as f32,
                1.0f32 / self.size.1 as f32,
                0.0,
                0.0,
            ];
            context.UpdateSubresource(&self.footprint, 0, None, footprint.as_ptr().cast(), 0, 0);
            context.PSSetConstantBuffers(0, Some(&[Some(self.footprint.clone())]));
            context.PSSetShaderResources(0, Some(&[srv]));
            context.PSSetSamplers(0, Some(&[Some(self.sampler.clone())]));
            context.Draw(3, 0);
            context.PSSetShaderResources(0, Some(&[None]));
            context.CopyResource(&slot.texture, &self.target);
            self.sequence += 1;
            slot.pending = Some(Pending {
                ticket,
                sequence: self.sequence,
                started: Instant::now(),
            });
            Ok(true)
        }
    }
}

unsafe fn run(
    hwnd: usize,
    state: Arc<(Mutex<State>, Condvar)>,
    mpv: Arc<Mpv>,
    glass: Control,
    ready: &mpsc::SyncSender<Result<(), String>>,
    started: &mut bool,
) -> WinResult<()> {
    unsafe {
        let mut device = None;
        let mut context = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
        let device = device.unwrap();
        let context = context.unwrap();
        let dxgi: IDXGIDevice = device.cast()?;
        let factory: IDXGIFactory2 = dxgi.GetAdapter()?.GetParent()?;
        let mut size = state.0.lock().unwrap().size;
        size = (size.0.max(1), size.1.max(1));
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: size.0,
            Height: size.1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT | DXGI_USAGE_SHADER_INPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
            AlphaMode: DXGI_ALPHA_MODE_IGNORE,
            ..Default::default()
        };
        let swap =
            factory.CreateSwapChainForHwnd(&device, HWND(hwnd as *mut _), &desc, None, None)?;
        // Tao owns window placement and borderless fullscreen. DXGI must not
        // install a competing message-queue handler for mode transitions.
        factory.MakeWindowAssociation(
            HWND(hwnd as *mut _),
            DXGI_MWA_NO_WINDOW_CHANGES | DXGI_MWA_NO_ALT_ENTER,
        )?;
        let mut render = match RenderContext::new_d3d11(mpv, device.as_raw()) {
            Ok(r) => r,
            Err(e) => {
                let _ = ready.send(Err(e));
                return Ok(());
            }
        };
        let callback = state.clone();
        render.on_update(move || {
            let mut s = callback.0.lock().unwrap();
            s.wake = true;
            callback.1.notify_one();
        });
        let mut gpu = GlassGpu::new(&device, size)?;
        let mut last_texture = None;
        let mut last_ticket = None;
        let mut was_visible = true;
        let mut frames = 0u64;
        let mut materials = 0u64;
        let mut report = Instant::now();
        *started = true;
        let _ = ready.send(Ok(()));
        loop {
            let requested = {
                let mut s = state.0.lock().unwrap();
                while !s.wake && !s.stop {
                    if gpu.pending() {
                        s = state.1.wait_timeout(s, Duration::from_millis(1)).unwrap().0;
                        break;
                    }
                    s = state.1.wait(s).unwrap();
                }
                if s.stop {
                    break;
                }
                s.wake = false;
                (s.size, s.visible)
            };
            let (requested, visible) = requested;
            gpu.collect(&context, &glass);
            let new_frame = render.update();
            if !visible || requested.0 == 0 || requested.1 == 0 {
                if new_frame {
                    render.skip();
                }
                was_visible = false;
                continue;
            }
            let resized = requested != size;
            if resized {
                context.ClearState();
                last_texture.take();
                swap.ResizeBuffers(
                    2,
                    requested.0,
                    requested.1,
                    DXGI_FORMAT_B8G8R8A8_UNORM,
                    DXGI_SWAP_CHAIN_FLAG(0),
                )?;
                size = requested;
                gpu.resize(&device, size)?;
                last_ticket = None;
            }
            if new_frame || resized || !was_visible {
                let texture: ID3D11Texture2D = swap.GetBuffer(0)?;
                context.ClearState();
                render.draw_d3d11(texture.as_raw()).map_err(|e| {
                    windows::core::Error::new(windows::Win32::Foundation::E_FAIL, e)
                })?;
                frames += 1;
                let ticket = glass.ticket();
                if let Some(ticket) = ticket {
                    if gpu.capture(&device, &context, &texture, ticket.clone())? {
                        last_ticket = Some(ticket);
                        materials += 1;
                    }
                }
                // Present submits the readback too; the next loop only maps a
                // completed slot, and never stalls the video waiting for it.
                swap.Present(0, DXGI_PRESENT(0)).ok()?;
                render.report_swap();
                last_texture = Some(texture);
            } else if let Some(ticket) = glass.ticket() {
                if last_ticket.as_ref() != Some(&ticket) {
                    if let Some(texture) = &last_texture {
                        if gpu.capture(&device, &context, texture, ticket.clone())? {
                            last_ticket = Some(ticket);
                            materials += 1;
                            context.Flush();
                        }
                    }
                }
            }
            was_visible = true;
            if report.elapsed() >= Duration::from_secs(2) {
                log::debug!(
                    "D3D11: {:.1} video fps, {:.1} glass submissions/sec",
                    frames as f64 / report.elapsed().as_secs_f64(),
                    materials as f64 / report.elapsed().as_secs_f64()
                );
                frames = 0;
                materials = 0;
                report = Instant::now();
            }
        }
        context.ClearState();
        drop(render);
        Ok(())
    }
}
