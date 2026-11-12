# Windows HDR output

This change adds HDR10 output to Navigator's existing D3D11 render-to-texture
path. The installed 0.5.0 release uses an SDR swap chain, as recorded in the
[brightness audit](windows-hdr-audit.md).

## Output contract

HDR activates when all of these conditions hold:

- mpv reports PQ or HLG video with BT.2020 or Display P3 primaries.
- The monitor containing the video window reports an active HDR color space.
- Its reported peak luminance is valid.
- DXGI accepts the HDR swap-chain format and color space.
- mpv accepts the complete output configuration.

The HDR target uses `DXGI_FORMAT_R10G10B10A2_UNORM` and
`DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020`. mpv produces BT.2020/PQ pixels
with full-range levels and a target peak from the display. HLG is converted to
PQ by mpv. The host does not apply an arbitrary brightness multiplier.

SDR sources, inactive HDR displays, invalid display data and rejected HDR
configurations use BGRA8 with BT.709/sRGB pixels and SDR DXGI signaling.
The app does not change the user's Windows HDR setting.

## Why HDR10 instead of scRGB

Microsoft supports both FP16/scRGB and 10-bit HDR10 swap chains. Its HDR sample
pairs each texture format with the matching color space. HDR10 is suitable here
because video uses an opaque D3D11 child window. The transparent WebView remains
a separate compositor surface.

Navigator's pinned mpv D3D11 render API supports both formats, but it uses the
legacy GPU renderer. Its generic linear output is normalized to the selected
target peak. It must not be treated as Windows scRGB, where 1.0 represents 80
nits. The `scrgb` target option and automatic color-space hints are documented
for `gpu-next`. Using absolute PQ avoids that extra reference-white conversion.

Harbor uses `gpu-next` by default on Windows and enables color-space hints.
Navigator keeps its current output ownership and supplies the equivalent HDR
format and signaling explicitly. It does not copy Harbor's RTX HDR settings or
switch the user's display mode.

## Transitions and thread safety

The mpv event worker reports source color metadata to the renderer. Monitor
moves, `WM_DISPLAYCHANGE` and `WM_SETTINGCHANGE` request a new display query.
The query uses a fresh DXGI factory and matches the video window's monitor,
including on a hybrid-GPU laptop.

A separate client-call worker sets mpv's target primaries, transfer, peak,
ICC state and output levels. Blocking client calls do not run on the UI or
render thread. The render thread continues consuming mpv render requests while
configuration is in progress, but holds presentation until the complete batch
succeeds. This avoids displaying a frame with mismatched pixels and signaling.

Failed HDR properties or swap-chain changes require a complete SDR restoration.
A failed SDR restoration surfaces an error instead of presenting an unknown
color configuration. HDR failures are retried after a display refresh.

## Menu samples

The main video remains on the GPU. The existing small, demand-driven menu
sampler decodes PQ to linear luminance, converts BT.2020 to BT.709 and maps the
sample to bounded SDR. The four-tap sample size, three staging slots and
nonblocking delivery remain unchanged. SDR samples retain the previous path.
This conversion affects menu samples only.

## Scope

This implements HDR10 output for the current native renderer. It does not add
licensed Dolby Vision display signaling or establish support for every Dolby
Vision profile. A file's Dolby Vision label alone is insufficient to verify its
fallback layer, decoded color metadata or output. The user's specific movie
still needs a comparison on the actual display.

## Build workflow

Run basic unit/regression checks and compile on the Zenbook over SSH.
The user performs hands-on playback, HDR and visual checks. This is the default
workflow for future desktop changes as well.

The basic output-policy tests cover source/display eligibility, invalid display
data, incomplete configurations, stale replies, HDR failure and SDR restoration.
They use no video files, UI automation or display experiments.

## References

- [Microsoft Advanced Color rendering requirements](https://learn.microsoft.com/en-us/windows/win32/direct3darticles/high-dynamic-range)
- [Microsoft D3D12 HDR sample](https://github.com/microsoft/DirectX-Graphics-Samples/blob/master/Samples/Desktop/D3D12HDR/src/D3D12HDR.cpp)
- [Pinned mpv D3D11 rendering contract](https://github.com/mpv-player/mpv/blob/9aeb21d5b55ef3cc0877663621ca373055dfd5e6/include/mpv/render_d3d11.h)
- [Pinned mpv output color processing](https://github.com/mpv-player/mpv/blob/9aeb21d5b55ef3cc0877663621ca373055dfd5e6/video/out/gpu/video_shaders.c)
- [Official mpv output options](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/options.rst)
- [Harbor Windows player initialization](https://github.com/Harborofficial/Harbor/blob/8a70ea3207c97e29cc5c735391977b417130d1c5/src-tauri/src/mpv.rs)
