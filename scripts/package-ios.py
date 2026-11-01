#!/usr/bin/env python3
"""Package an unsigned device archive for user re-signing, never exportArchive."""
from pathlib import Path
import hashlib,json,os,plistlib,shutil,subprocess,sys,tempfile,zipfile
archive=Path(sys.argv[1]).resolve();output=Path(sys.argv[2]).resolve()
app=archive/'Products/Applications/Navigator.app'
assert app.is_dir(), 'Archive has no Navigator.app'
info=plistlib.loads((app/'Info.plist').read_bytes())
assert info['CFBundleIdentifier']=='app.navigator.ios'
assert set(info['UIDeviceFamily'])=={1,2}
assert info.get('MinimumOSVersion')=='17.0'
assert not info.get('UIRequiresFullScreen',False)
assert 'UIBackgroundModes' not in info, 'Background playback is not part of v1'
assert not info.get('NSAppTransportSecurity',{}).get('NSAllowsArbitraryLoads',False)
executable=app/info['CFBundleExecutable']
archs=subprocess.check_output(['lipo','-archs',str(executable)],text=True).split()
assert archs==['arm64'],archs
assert 'iPhoneOS' in info['CFBundleSupportedPlatforms']
frameworks=list((app/'Frameworks').glob('*.framework'))
assert any(p.name=='MobileVLCKit.framework' for p in frameworks),'Missing native playback framework'
for framework in frameworks:
    framework_info=plistlib.loads((framework/'Info.plist').read_bytes())
    binary=framework/framework_info['CFBundleExecutable']
    framework_archs=subprocess.check_output(['lipo','-archs',str(binary)],text=True).split()
    assert framework_archs==['arm64'],(framework.name,framework_archs)
for p in app.rglob('*'):
    assert not p.name.startswith('.env') and p.suffix!='mobileprovision',f'Unexpected private payload: {p}'
    assert not p.name.endswith('.xcframework'),'Simulator/device SDK bundle must not be embedded whole'
assert (app/'PrivacyInfo.xcprivacy').exists()
assert (app/'ThirdPartyNotices.txt').exists()
output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='navigator-ipa-') as temp:
    payload=Path(temp)/'Payload';payload.mkdir()
    shutil.copytree(app,payload/app.name,symlinks=True)
    subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(payload),str(output)],check=True)
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    assert 'Payload/Navigator.app/Info.plist' in z.namelist()
    assert not any('iphonesimulator' in n.lower() for n in z.namelist())
build={'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
       'signing':'unsigned; user re-signing required','sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
       'size':output.stat().st_size,'sdk':subprocess.check_output(['xcodebuild','-version'],text=True).strip(),
       'engine':'MobileVLCKit 3.7.5','devices':['iPhone','iPad'],'minimumOS':'17.0','run':os.getenv('GITHUB_RUN_ID')}
(output.parent/'build-info.json').write_text(json.dumps(build,indent=2)+'\n')
print(json.dumps(build,indent=2))
