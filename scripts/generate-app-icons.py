#!/usr/bin/env python3
"""Export Navigator's Figma vectors into platform-native icon resources.
Requires Pillow and rsvg-convert; iconutil is used when available on macOS.
No application build or development server is started.
"""
from pathlib import Path
from copy import deepcopy
import json
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/icons'
RES = ROOT / 'android/app/src/main/res'
GEOMETRY = json.loads((OUT / 'source/figma-geometry.json').read_text())
SVG_NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG_NS)
BASE = ET.parse(OUT / 'source/macos-figma-export.svg').getroot()
DEFS = BASE.find(f'{{{SVG_NS}}}defs')
MASKED = BASE.find(f'.//{{{SVG_NS}}}g[@mask]')
BODY_SCALE = 1024 / 824
SHIP_WIDTH = GEOMETRY['ship']['w'] + GEOMETRY['paths'][0]['strokeWeight']
ANDROID_MARK_DP = 48
ANDROID_SHIFT_Y_DP = -1.5
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
ICO_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256]
SRGB_PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def svg(body, defs='', viewbox='0 0 1024 1024', width=1024):
    return f'<svg xmlns="{SVG_NS}" width="{width}" height="{width}" viewBox="{viewbox}" fill="none"><defs>{defs}</defs>{body}</svg>'


def element_text(node):
    return ET.tostring(node, encoding='unicode')


def clean_filters(node):
    # Keep vector gradients/soft background lighting, omit Figma-specific texture.
    for parent in node.iter():
        for child in list(parent):
            if child.tag.split('}')[-1] in {'feTurbulence', 'feDisplacementMap', 'feMerge'}:
                parent.remove(child)


def ship_parts(color=None, outline=False):
    definitions, paths = [], []
    for index, part in enumerate(GEOMETRY['paths']):
        if color is None:
            definitions.append(f'<linearGradient id="ship-{index}" x1="0" x2="0" y1="0" y2="{max(part["h"], 1)}" gradientUnits="userSpaceOnUse"><stop stop-color="#F0FDFA"/><stop offset="1" stop-color="#5EEAD4"/></linearGradient>')
        stroke = color or f'url(#ship-{index})'
        for vector in part['paths']:
            path = f'<path d="{vector["data"]}" fill="none" stroke="{stroke}" stroke-width="{part["strokeWeight"]}" stroke-linecap="round" stroke-linejoin="round"/>'
            if outline:
                path = f'<path d="{vector["data"]}" fill="none" stroke="#07564D" stroke-width="{part["strokeWeight"] + 16}" stroke-linecap="round" stroke-linejoin="round"/>' + path
            paths.append(f'<g transform="translate({part["x"]} {part["y"]})">{path}</g>')
    return ''.join(definitions), ''.join(paths)


def transformed_ship(rendered_width, center=512, color=None, outline=False):
    definitions, body = ship_parts(color, outline)
    scale = rendered_width / SHIP_WIDTH
    return definitions, f'<g transform="translate({center} {center}) scale({scale}) translate(-512 -512)">{body}</g>'


def render(source, target, size, opaque=False):
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(source), '-o', str(target)], check=True)
    # Normalize PNGs to 8-bit sRGB-compatible RGB/RGBA; iOS requires no alpha.
    image = Image.open(target).convert('RGBA')
    if opaque:
        assert image.getchannel('A').getextrema() == (255, 255), f'{target}: non-opaque icon'
        image = image.convert('RGB')
    image.save(target, optimize=True, icc_profile=SRGB_PROFILE)


def android_vector(monochrome=False):
    scale = ANDROID_MARK_DP / SHIP_WIDTH
    offset = 54 - 512 * scale
    groups = []
    for part in GEOMETRY['paths']:
        paths = []
        for vector in part['paths']:
            stroke = ' android:strokeColor="#FFFFFFFF"' if monochrome else ''
            gradient = '' if monochrome else f'<aapt:attr name="android:strokeColor"><gradient android:type="linear" android:startX="0" android:startY="0" android:endX="0" android:endY="{max(part["h"], 1)}" android:startColor="#FFF0FDFA" android:endColor="#FF5EEAD4"/></aapt:attr>'
            paths.append(f'<path android:pathData="{vector["data"]}" android:fillColor="#00000000" android:strokeWidth="{part["strokeWeight"]}" android:strokeLineCap="round" android:strokeLineJoin="round"{stroke}>{gradient}</path>')
        groups.append(f'<group android:translateX="{part["x"]}" android:translateY="{part["y"]}">{"".join(paths)}</group>')
    return f'<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:scaleX="{scale}" android:scaleY="{scale}" android:translateX="{offset}" android:translateY="{offset + ANDROID_SHIFT_Y_DP}">{"".join(groups)}</group></vector>\n'


def generate_android():
    # Android: full bleed 108dp background, 48dp mark inside the 66dp safe zone.
    android_bg = '<linearGradient id="android-bg" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse"><stop stop-color="#0D6F65"/><stop offset="0.55" stop-color="#0B403A"/><stop offset="1" stop-color="#071A18"/></linearGradient>'
    defs, mark = transformed_ship(ANDROID_MARK_DP, center=54)
    mark = f'<g transform="translate(0 {ANDROID_SHIFT_Y_DP})">{mark}</g>'
    android_foreground = svg(mark, defs, '0 0 108 108', 108)
    android_background = svg('<path d="M0 0H108V108H0Z" fill="url(#android-bg)"/>', android_bg, '0 0 108 108', 108)
    write(OUT / 'android/foreground.svg', android_foreground)
    write(OUT / 'android/background.svg', android_background)
    write(RES / 'drawable/ic_launcher_foreground.xml', android_vector())
    write(RES / 'drawable/ic_launcher_monochrome.xml', android_vector(monochrome=True))
    bg_vector = '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:pathData="M0 0H108V108H0Z"><aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="0" android:startY="0" android:endX="108" android:endY="108"><item android:offset="0" android:color="#FF0D6F65"/><item android:offset="0.55" android:color="#FF0B403A"/><item android:offset="1" android:color="#FF071A18"/></gradient></aapt:attr></path></vector>\n'
    write(RES / 'drawable/ic_launcher_background.xml', bg_vector)
    for version in [26, 33]:
        mono = '\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />' if version >= 33 else ''
        adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />' + mono + '\n</adaptive-icon>\n'
        for name in ['ic_launcher', 'ic_launcher_round']:
            write(RES / f'mipmap-anydpi-v{version}/{name}.xml', adaptive)
    for density, scale in DENSITIES.items():
        for name, shape in [('ic_launcher', '<rect x="18" y="18" width="72" height="72" rx="16"/>'), ('ic_launcher_round', '<circle cx="54" cy="54" r="36"/>')]:
            icon = svg('<g clip-path="url(#legacy-mask)"><path d="M0 0H108V108H0Z" fill="url(#android-bg)"/>' + mark + '</g>', defs + android_bg + '<clipPath id="legacy-mask">' + shape + '</clipPath>', '18 18 72 72', 72)
            write(OUT / f'android/{name}.svg', icon)
            render(OUT / f'android/{name}.svg', RES / f'mipmap-{density}/{name}.png', int(48 * scale))
    composite = svg('<path d="M0 0H108V108H0Z" fill="url(#android-bg)"/>' + mark, defs + android_bg, '18 18 72 72', 512)
    write(OUT / 'android/play-store.svg', composite)
    render(OUT / 'android/play-store.svg', OUT / 'android/play-store-512.png', 512)
    render(OUT / 'android/foreground.svg', OUT / 'android/foreground-432.png', 432)
    render(OUT / 'android/background.svg', OUT / 'android/background-432.png', 432, opaque=True)
    for name in ['ic_launcher_foreground', 'ic_launcher_background', 'ic_launcher_monochrome']:
        shutil.copyfile(RES / f'drawable/{name}.xml', OUT / f'android/{name}.xml')


def windows_artwork(small=False):
    # Reuse the dimensional macOS tile, with 40px of transparent space around
    # its 824px body. Omit the two exterior shadows so the silhouette stays crisp.
    root = deepcopy(BASE)
    root.set('viewBox', '64 64 896 896')
    for child in root:
        if child.tag.endswith('g'):
            child.attrib.pop('filter', None)
    if small:
        # At <=32px, grain and inner shadows obscure the thin boat strokes.
        # Use the same geometry with a larger, clean mark on the original tile.
        masked = root.find(f'.//{{{SVG_NS}}}g[@mask]')
        boat = next(child for child in masked if child.find(f'{{{SVG_NS}}}path') is not None)
        index = list(masked).index(boat)
        masked.remove(boat)
        definitions, mark = transformed_ship(560)
        root.find(f'{{{SVG_NS}}}defs').extend(ET.fromstring(f'<defs xmlns="{SVG_NS}">{definitions}</defs>'))
        masked.insert(index, ET.fromstring(f'<g xmlns="{SVG_NS}">{mark}</g>'))
        clean_filters(root)
    return element_text(root)


def generate_windows():
    write(OUT / 'windows/navigator.svg', windows_artwork())
    write(OUT / 'windows/navigator-small.svg', windows_artwork(small=True))
    render(OUT / 'windows/navigator.svg', OUT / 'windows/navigator-1024.png', 1024)
    pngs = []
    for size in ICO_SIZES:
        target = OUT / f'windows/png/navigator-{size}.png'
        source = 'navigator-small.svg' if size <= 32 else 'navigator.svg'
        render(OUT / 'windows' / source, target, size)
        pngs.append(target.read_bytes())
    # Every ICO entry is rendered at its exact display size, including fractional DPI.
    offset = 6 + 16 * len(ICO_SIZES)
    entries = []
    for size, data in zip(ICO_SIZES, pngs):
        entries.append(struct.pack('<BBBBHHII', 0 if size == 256 else size, 0 if size == 256 else size, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (OUT / 'windows/Navigator.ico').write_bytes(struct.pack('<HHH', 0, 1, len(pngs)) + b''.join(entries) + b''.join(pngs))


def generate():
    # Modern Apple sources: opaque, square background and crisp transparent mark.
    bg_defs = deepcopy(DEFS)
    clean_filters(bg_defs)
    backgrounds = [deepcopy(node) for node in MASKED if node.tag.endswith('rect') or node.find(f'{{{SVG_NS}}}circle') is not None]
    background = svg(f'<g transform="scale({BODY_SCALE}) translate(-100 -100)">' + ''.join(element_text(n) for n in backgrounds) + '</g>', ''.join(element_text(n) for n in bg_defs))
    definitions, mark = ship_parts()
    foreground = svg(mark, definitions)
    write(OUT / 'source/background.svg', background)
    write(OUT / 'source/ship.svg', foreground)
    for platform in ['macos', 'ios']:
        write(OUT / platform / 'layers/background.svg', background)
        write(OUT / platform / 'layers/foreground.svg', foreground)
        render(OUT / platform / 'layers/background.svg', OUT / platform / 'layers/background-1024.png', 1024, opaque=True)
        render(OUT / platform / 'layers/foreground.svg', OUT / platform / 'layers/foreground-1024.png', 1024)
        root = ET.fromstring(background)
        own_defs = root.find(f'{{{SVG_NS}}}defs')
        own_defs.extend(ET.fromstring(f'<defs xmlns="{SVG_NS}">{definitions}</defs>'))
        root.append(ET.fromstring(f'<g xmlns="{SVG_NS}">{mark}</g>'))
        write(OUT / platform / 'navigator-1024.svg', element_text(root))
        render(OUT / platform / 'navigator-1024.svg', OUT / platform / 'navigator-1024.png', 1024, opaque=True)

    # Preserve the exact Figma macOS compatibility tile, shadow and 100px inset.
    shutil.copyfile(OUT / 'source/macos-figma-export.svg', OUT / 'macos/navigator.svg')
    render(OUT / 'macos/navigator.svg', OUT / 'macos/navigator.png', 1024)
    shutil.copyfile(OUT / 'macos/navigator.png', ROOT / 'public/logo/desktop/navigator.png')
    iconset = OUT / 'macos/Navigator.iconset'
    iconset.mkdir(exist_ok=True)
    for points in [16, 32, 128, 256, 512]:
        for scale in [1, 2]:
            suffix = '@2x' if scale == 2 else ''
            render(OUT / 'macos/navigator.svg', iconset / f'icon_{points}x{points}{suffix}.png', points * scale)
    if shutil.which('iconutil'):
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(OUT / 'macos/Navigator.icns')], check=True)

    # iOS universal asset catalog and web-app touch icon.
    catalog = OUT / 'ios/AppIcon.appiconset'
    catalog.mkdir(exist_ok=True)
    shutil.copyfile(OUT / 'ios/navigator-1024.png', catalog / 'Navigator-1024.png')
    write(catalog / 'Contents.json', json.dumps({'images': [{'filename': 'Navigator-1024.png', 'idiom': 'universal', 'platform': 'ios', 'size': '1024x1024'}], 'info': {'author': 'xcode', 'version': 1}}, indent=2) + '\n')
    render(OUT / 'ios/navigator-1024.svg', ROOT / 'app/apple-icon.png', 180, opaque=True)

    generate_android()

    generate_windows()
    print('Generated macOS, Android, Windows and iOS icon assets in assets/icons/.')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android-only', action='store_true', help='Regenerate only Android resources')
    parser.add_argument('--windows-only', action='store_true', help='Regenerate only Windows resources')
    args = parser.parse_args()
    if args.android_only and args.windows_only:
        parser.error('Choose only one platform-only option')
    if args.windows_only:
        generate_windows()
        print('Generated Windows icon resources.')
    elif args.android_only:
        generate_android()
        print('Generated Android icon resources.')
    else:
        generate()
