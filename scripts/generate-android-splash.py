#!/usr/bin/env python3
"""Dedicated resolution-independent Android launch artwork from Figma geometry.
Regenerates splash files only; launcher and other platform icons are unchanged.
"""
from pathlib import Path
import importlib.util
import sys
sys.dont_write_bytecode = True
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('icons', ROOT / 'scripts/generate-app-icons.py')
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)
OUT = ROOT / 'assets/icons/android/splash'
RES = ROOT / 'android/app/src/main/res/drawable'
A = '{http://schemas.android.com/apk/res/android}'
ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
ET.register_namespace('aapt', 'http://schemas.android.com/aapt')


def generate():
    # Android's unplated splash canvas is 288dp, with a 192dp safe circle.
    # Dedicated 144dp artwork retains the launcher's upward optical offset.
    mark_size, canvas, shift = 144, 288, -4.5
    vector = ET.fromstring(icons.android_vector())
    for name in ['width', 'height']:
        vector.set(A+name, f'{canvas}dp')
    for name in ['viewportWidth', 'viewportHeight']:
        vector.set(A+name, str(canvas))
    group = vector.find('group')
    scale = mark_size / icons.SHIP_WIDTH
    offset = canvas/2 - 512*scale
    for name in ['scaleX', 'scaleY']:
        group.set(A+name, str(scale))
    group.set(A+'translateX', str(offset))
    group.set(A+'translateY', str(offset+shift))
    RES.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(vector).write(RES/'ic_splash_ship.xml', encoding='utf-8', xml_declaration=True)
    definitions, mark = icons.transformed_ship(mark_size, center=canvas/2)
    mark = f'<g transform="translate(0 {shift})">{mark}</g>'
    icons.write(OUT/'mark.svg', icons.svg(mark, definitions, '0 0 288 288', canvas))
    icons.render(OUT/'mark.svg', OUT/'mark-1152.png', 1152)
    for name, width, height in [('portrait',432,960), ('landscape',960,432)]:
        short = min(width,height)
        defs = definitions + f'''<linearGradient id="base" x1="0" y1="0" x2="{width}" y2="{height}" gradientUnits="userSpaceOnUse"><stop stop-color="#0A0A0A"/><stop offset="1" stop-color="#042F2E"/></linearGradient>
<radialGradient id="top" cx="{width*.5}" cy="{height*.05}" r="{short*.9}" gradientUnits="userSpaceOnUse"><stop stop-color="#14B8A6" stop-opacity=".55"/><stop offset="1" stop-color="#14B8A6" stop-opacity="0"/></radialGradient>
<radialGradient id="bottom" cx="{width*.5}" cy="{height*1.05}" r="{short*.95}" gradientUnits="userSpaceOnUse"><stop stop-color="#0D9488" stop-opacity=".5"/><stop offset="1" stop-color="#0D9488" stop-opacity="0"/></radialGradient>
<radialGradient id="halo" cx="{width*.5}" cy="{height*.5}" r="{short*.4}" gradientUnits="userSpaceOnUse"><stop stop-color="#14B8A6" stop-opacity=".16"/><stop offset="1" stop-color="#14B8A6" stop-opacity="0"/></radialGradient>'''
        body = ''.join(f'<path d="M0 0H{width}V{height}H0Z" fill="url(#{paint})"/>' for paint in ['base','top','bottom','halo'])
        body += f'<g transform="translate({(width-canvas)/2} {(height-canvas)/2})">{mark}</g>'
        source = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><defs>{defs}</defs>{body}</svg>'
        icons.write(OUT/f'{name}.svg', source)
        # Non-square previews; native screen uses matching shaders, not bitmaps.
        import subprocess
        subprocess.run(['rsvg-convert','-w',str(width*2),'-h',str(height*2),str(OUT/f'{name}.svg'),'-o',str(OUT/f'{name}-preview.png')],check=True)
    print('Generated dedicated 288dp splash vector, 1152px mark and portrait/landscape design previews.')


if __name__ == '__main__':
    generate()
