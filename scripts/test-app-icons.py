#!/usr/bin/env python3
"""Validate platform icon exports and Android variant-independent wiring."""
from pathlib import Path
import json
import math
import struct
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'assets/icons'
RES = ROOT / 'android/app/src/main/res'
ANDROID = '{http://schemas.android.com/apk/res/android}'


def check_png(path, size, opaque=False, mode=None):
    with Image.open(path) as image:
        assert image.size == (size, size), (path, image.size)
        if mode:
            assert image.mode == mode, (path, image.mode)
        assert image.info.get('icc_profile'), f'{path}: missing sRGB profile'
        if opaque:
            assert image.convert('RGBA').getchannel('A').getextrema() == (255, 255), path


for platform in ['ios', 'macos']:
    check_png(ICONS / platform / 'navigator-1024.png', 1024, opaque=True, mode='RGB')
    check_png(ICONS / platform / 'layers/background-1024.png', 1024, opaque=True)
    check_png(ICONS / platform / 'layers/foreground-1024.png', 1024, mode='RGBA')

catalog = ICONS / 'ios/AppIcon.appiconset'
for entry in json.loads((catalog / 'Contents.json').read_text())['images']:
    check_png(catalog / entry['filename'], 1024, opaque=True, mode='RGB')
check_png(ROOT / 'app/apple-icon.png', 180, opaque=True)
play = ICONS / 'android/play-store-512.png'
check_png(play, 512, opaque=True, mode='RGBA')
assert play.stat().st_size <= 1024 * 1024, 'Play Store PNG exceeds 1MB'

# Test the rendered mark itself, including rounded strokes, against the central
# 66dp circle, rather than checking only the vectors' control-point bounds.
alpha = Image.open(ICONS / 'android/foreground-432.png').getchannel('A')
assert alpha.getbbox() is not None
for y in range(alpha.height):
    for x in range(alpha.width):
        if alpha.getpixel((x, y)) > 16:
            assert math.hypot(x + 0.5 - 216, y + 0.5 - 216) <= 132, (x, y)
background = Image.open(ICONS / 'android/background-432.png').convert('RGBA')
assert background.getchannel('A').getextrema() == (255, 255)

for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    for name in ['ic_launcher', 'ic_launcher_round']:
        check_png(RES / f'mipmap-{density}/{name}.png', size)

for api in [26, 33]:
    for name in ['ic_launcher', 'ic_launcher_round']:
        root = ET.parse(RES / f'mipmap-anydpi-v{api}/{name}.xml').getroot()
        assert root.tag == 'adaptive-icon'
        for layer in ['background', 'foreground'] + (['monochrome'] if api >= 33 else []):
            reference = root.find(layer).attrib[ANDROID + 'drawable']
            assert reference == f'@drawable/ic_launcher_{layer}'
            vector = ET.parse(RES / f'drawable/ic_launcher_{layer}.xml').getroot()
            assert vector.attrib[ANDROID + 'viewportWidth'] == '108'
            assert vector.attrib[ANDROID + 'viewportHeight'] == '108'

manifest = ET.parse(ROOT / 'android/app/src/main/AndroidManifest.xml').getroot()
application = manifest.find('application')
assert application.attrib[ANDROID + 'icon'] == '@mipmap/ic_launcher'
assert application.attrib[ANDROID + 'roundIcon'] == '@mipmap/ic_launcher_round'
for override in (ROOT / 'android/app/src').glob('*/AndroidManifest.xml'):
    other = ET.parse(override).getroot().find('application')
    if other is not None:
        assert other.attrib.get(ANDROID + 'icon', '@mipmap/ic_launcher') == '@mipmap/ic_launcher'
        assert other.attrib.get(ANDROID + 'roundIcon', '@mipmap/ic_launcher_round') == '@mipmap/ic_launcher_round'

sizes = {16, 20, 24, 32, 40, 48, 64, 96, 128, 256}
ico = Image.open(ICONS / 'windows/Navigator.ico')
assert ico.ico.sizes() == {(size, size) for size in sizes}
for size in sizes:
    assert ico.ico.getimage((size, size)).size == (size, size)

icns = (ICONS / 'macos/Navigator.icns').read_bytes()
assert icns[:4] == b'icns' and struct.unpack('>I', icns[4:8])[0] == len(icns)
assert (ROOT / 'public/logo/desktop/navigator.png').read_bytes() == (ICONS / 'macos/navigator.png').read_bytes()
for points in [16, 32, 128, 256, 512]:
    for scale in [1, 2]:
        suffix = '@2x' if scale == 2 else ''
        check_png(ICONS / f'macos/Navigator.iconset/icon_{points}x{points}{suffix}.png', points * scale)
print('PASS: Apple dimensions/opacity, Android safe area/layers/densities/manifest, sRGB, ICO sizes and ICNS integrity')
