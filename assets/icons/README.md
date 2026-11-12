# Navigator platform icons

Source design: [Navigator in Figma](https://www.figma.com/design/syUS8RJRTFt6hOFDr0EtdI/Navigator?node-id=602-2).

The ship in the original Figma master was enlarged **28%**, retaining the macOS tile and its existing 100px compatibility-export inset. Its rendered stroke bounds now occupy about 60% of the tile. This is an optical design choice, not an Apple-mandated percentage.

## Files and integration

| Platform | Deliverable | Integration |
| --- | --- | --- |
| macOS | `macos/Navigator.icns`, `macos/Navigator.iconset`, `macos/navigator.png` | `public/logo/desktop/navigator.png` is updated; the existing macOS packaging script uses it. |
| Modern Apple icons | `macos/layers/`, `ios/layers/` | Full-bleed, unmasked 1024px background and transparent SVG/PNG foreground for Icon Composer. These are source layers, not a compiled `.icon` document. |
| iOS | `ios/AppIcon.appiconset`, `ios/navigator-1024.png` | Ready for an Xcode asset catalog. The web app's `app/apple-icon.png` is also updated. There is no native iOS project in this repository. |
| Android | `android/foreground.svg`, `android/background.svg`, vector XML and `android/play-store-512.png` | Production resources are under `android/app/src/main/res/`; the common manifest applies to every APK variant. |
| Windows | `windows/Navigator.ico`, `windows/navigator.svg`, `windows/navigator-small.svg`, `windows/png/` | The native resource compiler embeds the ICO. Windows packaging also uses it for the installer, Start shortcut and installed-app entry. |

Android uses a **108dp** adaptive canvas, with a **48dp** rendered foreground mark horizontally centered and shifted **1.5dp upward** for optical balance within the safe area. API 26+ receives foreground/background adaptive layers; API 33+ also gets a monochrome layer. API 24–25 receive density-specific legacy normal/round PNGs. No white plate, outer shadow or pre-rounded tile is baked into the adaptive layers. The splash screen uses a separate 288dp vector canvas with a 144dp ship, retaining the upward optical balance. `android/splash/` includes the 1152px mark export and portrait/landscape design previews.

Windows uses the macOS master's rounded dark teal tile, dimensional boat and soft background lighting. It has no dark boat outline or exterior drop shadow. A tighter canvas leaves 40 source pixels around the 824px tile. At 32px and below, a slightly larger boat with clean gradient strokes replaces fine grain and inner shadows for legibility. Transparent corners remain outside the tile. The ICO contains independently rendered **16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128 and 256px** PNG entries for common Windows display scales.

`windows/preview.png` compares the previous icon and the new exports on light and dark backgrounds. This is an asset preview, not a Windows screenshot. Windows shell appearance must still be checked after a native rebuild.

Apple modern master PNGs are **opaque RGB 1024×1024**, with no rounded mask. The compatibility macOS `.icns` intentionally retains the legacy mask, transparent canvas inset and shadow used by this app's existing packaging.

## Official guidance consulted

- [Apple Human Interface Guidelines — App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons): 1024px square masters, centered artwork, unmasked opaque backgrounds, vector foregrounds and system-applied masks/effects.
- [Apple Icon Composer](https://developer.apple.com/icon-composer/): shared layered artwork and platform appearance annotations.
- [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive): 108dp layers, 48–66dp logo range, 66dp safe zone, and monochrome support.
- [Google Play icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications): 512px square, sRGB 32-bit PNG, no baked outer shadow or rounded mask.
- [Microsoft app-icon design](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design): simple silhouette, restrained gradients, and contrast on light/dark backgrounds.
- [Microsoft icon construction](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction): exact-size ICO variants, including at least 16, 24, 32, 48 and 256px.

## Regeneration

Requires Python with Pillow, `rsvg-convert`, and Apple's `iconutil` for `.icns` packaging:

```sh
python3 scripts/generate-app-icons.py
python3 scripts/test-app-icons.py
```

To update only Windows assets, use `python3 scripts/generate-app-icons.py --windows-only`.

The vector geometry and compatibility SVG were exported from the updated Figma file through MCP. The generator also updates the Android resources and the existing macOS/iOS image entry points. It does not build an app, APK, or executable. Installed apps and previously built APKs retain their old resources until rebuilt and reinstalled.

## Android launch treatment

The splash vector is generated separately with `python3 scripts/generate-android-splash.py`.
It references the same Figma ship geometry and is tested against Android's 192dp
safe circle. The native launch surface uses the macOS master's dark teal base and
soft teal light fields, rendered as static shaders rather than a stretched bitmap.
The preview PNGs are design renders, not Android screenshots. The installed APK
uses the vector XML and native drawing code, not these raster previews.
