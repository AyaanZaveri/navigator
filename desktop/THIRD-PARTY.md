# Native playback source and libraries

The desktop shell is licensed under **AGPL-3.0-only**. Its copied/adapted code
comes from [Viren070/AIOStreams](https://github.com/Viren070/AIOStreams), commit
[`c358754b0ae4758d034badf8618de6fdb7fa9333`](https://github.com/Viren070/AIOStreams/tree/c358754b0ae4758d034badf8618de6fdb7fa9333/packages/desktop).
The original license is included in `licenses/AIOStreams-AGPL-3.0.txt`.

| Navigator file | Original | Changes |
| --- | --- | --- |
| `src/mpv.rs` | `core/src/mpv.rs` | Fail startup on rejected options; expose playlist entry IDs to associate events with playback sessions. |
| `src/render.rs` | `core/src/render.rs` | Module paths and attribution. |
| `src/platform/macos.rs` | `app/src/platform/macos.rs` | Retain the OpenGL compatibility renderer; remove other outputs and unrelated platform services; add GL resource cleanup and Navigator menu. |
| `src/platform/macos/hdr.rs`, `src/hdr.rs` | `app/src/platform/macos/video.rs` | Adapt OpenGL HDR/EDR handling, PQ/HLG detection, display headroom, and SDR restoration; retain no output selector or AVFoundation/Metal output; guard 8-bit surfaces and invalid display values. |
| `src/platform/windows.rs` | `app/src/platform/windows.rs` | Retain the embedded HWND video surface; remove unrelated services. |
| `src/platform/linux.rs` | `app/src/platform/linux.rs` | Retain the GTK/OpenGL surface and native display integration; remove unrelated services. |
| `libs.json` | `libs.pin`, `libs-macos.pin` | Preserve pinned release and library archive SHA-256 values. |

The rest of the native shell and the Navigator integration are newly written.
Distributing a desktop derivative requires preserving the AGPL license, notices,
and corresponding source. This file does not relicense unrelated Navigator files.

`npm run desktop:fetch-libs` downloads the pinned **AIOStreams/libs** distribution.
Keep its `licenses` directory with the binaries: it includes libmpv, FFmpeg,
libass, and the bundled codec/rendering dependencies' notices. Their licenses and
source/build information are published at [AIOStreams/libs](https://github.com/AIOStreams/libs).
Windows additionally uses the pinned LunarG Vulkan loader, with its license.
Linux uses the system libmpv and its dependencies.

Packaging downloads the official **Node.js 26.7.0** runtime from nodejs.org,
checks its SHA-256 against the official release manifest, and includes its
`LICENSE` and runtime version/checksum alongside the binary.

Rust dependencies are pinned in `Cargo.lock`; their package metadata declares
their licenses. The standalone web server contains the existing project's npm
dependencies. Review and include the complete dependency notices and sources
required for a public release, together with this file and the bundled notices.
