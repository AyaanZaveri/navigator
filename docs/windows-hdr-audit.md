# Windows HDR brightness audit

Date: 2026-11-11. This audit covers Navigator 0.5.0 and the user's Zenbook.
The UI fixes in this work do not change native video output.

## Finding

Navigator 0.5.0 decodes HDR sources, but its Windows presentation surface is SDR.
The display can be in HDR mode while an individual application still sends SDR.
Good color and smooth gradients do not establish that the app sends HDR output.

The installed Windows executable matches the verified 0.5.0 release:
`6b6705c569b8de18d66c01cf29104fd79ecafa194838f413156699388387846e`.
In `desktop/src/platform/windows_video.rs`, the swap chain and resized buffers
use `DXGI_FORMAT_B8G8R8A8_UNORM`. The code does not select an HDR color space.
`desktop/src/platform/windows.rs` uses `vo=libmpv`, hardware decoding and
`tone-mapping=bt.2390`. The host supplies the render target. mpv does not own
this swap chain or choose its HDR format.

The read-only display query ran in the signed-in Windows session. It returned:

```text
target=0 status=0 advancedColorSupported=True advancedColorEnabled=True bitsPerChannel=10 flags=3
ProductVersion=0.5.0
```

The same query from the SSH session returned access denied. It was rerun through
a temporary interactive task. That task was removed after the query. The probe
did not change display settings, app settings, playback, or the installed app.

This confirms a display that supports and has enabled Advanced Color. The HDR
output gap is in Navigator's presentation path. It is a strong explanation for
the reported brightness difference. It does not measure the exact luminance
of the user's movie, prove every Dolby Vision profile is handled correctly,
or compare the physical brightness of the two laptops.

## Harbor comparison

The reference was Harbor commit `8a70ea3207c97e29cc5c735391977b417130d1c5`.
Its Windows path defaults to `vo=gpu-next`, or `gpu` when selected. Embedded
Windows playback uses `gpu-api=d3d11` and `target-colorspace-hint=yes`.
mpv's native output can select the swap chain and output color space.
Harbor also tracks the target monitor's HDR state. Its separate HDR-to-SDR
mode sets different transfer, primaries and tone-mapping options.

The `target-peak=10000` setting belongs to Harbor's RTX HDR path. It is not a
universal brightness fix and must not be copied into Navigator as one.
The official mpv manual documents color-space hints for `vo=gpu-next`.
Navigator uses `vo=libmpv`. Adding only `target-colorspace-hint=yes` cannot
change the SDR swap chain that Navigator creates itself.

Sources:

- [Harbor mpv initialization and output selection](https://github.com/Harborofficial/Harbor/blob/8a70ea3207c97e29cc5c735391977b417130d1c5/src-tauri/src/mpv.rs)
- [Harbor monitor handling](https://github.com/Harborofficial/Harbor/blob/8a70ea3207c97e29cc5c735391977b417130d1c5/src-tauri/src/monitors.rs)
- [Microsoft Advanced Color rendering requirements](https://learn.microsoft.com/en-us/windows/win32/direct3darticles/high-dynamic-range)
- [Official mpv output options](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/options.rst)

## Recommended implementation

Keep the current app-owned video surface and add an explicit HDR output policy.
This preserves the existing native window and overlay integration.

1. Identify the monitor that contains the video window. Read its active HDR
   state and luminance data. Refresh this data after a display setting change
   or a move to another monitor. Do not force the Windows HDR setting on.
2. On an active HDR display, use an FP16 swap chain with
   `DXGI_FORMAT_R16G16B16A16_FLOAT` and the scRGB color space
   `DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709`. Check color-space support and
   set it explicitly. Keep the SDR fallback if the display or driver cannot
   support the HDR path.
3. Configure mpv to produce the matching transfer and primaries. Verify the
   conversion from mpv's linear reference white to Windows scRGB units.
   In Windows scRGB, a value of 1.0 represents 80 nits on an HDR display.
   A format change without the correct luminance scale can still look dim.
4. Use content and display luminance data for highlight mapping. Do not
   increase all pixels with a guessed brightness or gamma value. Distinguish
   HDR10/HLG rendering from Dolby Vision metadata handling. An HDR10 display
   does not establish Dolby Vision output support.
5. Convert the small sampled image used by player menus to SDR separately.
   The present sampling shader assumes SDR pixels. Feeding linear HDR pixels
   into that shader would change menu colors. Keep the current sampling bounds
   and demand rules. Do not restart the earlier blur performance experiment.
6. Keep UI white and SDR video stable on both HDR and SDR displays. Handle
   source changes, HDR setting changes, resize, pause and monitor changes.
   Keep blocking mpv property calls off the rendering thread.

Microsoft recommends FP16/scRGB for general-purpose Advanced Color apps. A
10-bit HDR10 swap chain is another supported design, but requires matching
BT.2020/PQ encoding and the correct output signaling. Neither design is a
single brightness option.

An alternative is to let mpv's `gpu-next` own the Windows output, as Harbor does.
That would require a review of the existing render-to-texture and menu sampling
integration. Changing the renderer solely to copy Harbor's option list would
leave those interactions unresolved.

## Required validation before shipping native HDR changes

Use a separate test build on the Zenbook. Keep the installed app and its profile.
All Windows builds must remain on that machine over SSH.

- Check the actual swap-chain format and color space at runtime.
- Use tagged SDR, HDR10/PQ and HLG patterns. Verify black, reference white,
  highlight clipping and color primaries. Test the specific Dolby Vision profile
  separately, using lawful local media and known metadata.
- Compare the same frames and settings in Navigator and Harbor. Use a luminance
  meter for a measured brightness claim. SDR screenshots cannot verify HDR nits.
- Check HDR-to-SDR source changes, an SDR monitor, HDR off, monitor moves,
  fullscreen, paused seeks, menu sampling, and shutdown.
- Do not claim fixed HDR brightness from source inspection, a file label,
  bit depth alone, or an ordinary screenshot.

No native renderer changes, new desktop builds, or physical HDR output checks
were performed in this audit. A new native test build requires an explicit build
request under the project's development rules.
