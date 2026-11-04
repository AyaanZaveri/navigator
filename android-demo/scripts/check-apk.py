"""Check the assembled APK, including underscore-prefixed Next.js resources."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
apk = root / "app/build/outputs/apk/debug/app-debug.apk"
assets = root / "app/src/main/assets"
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None, "Corrupt APK entry"
    names = archive.namelist()
    assert any(name.startswith("assets/web/_next/static/") for name in names), "Next.js chunks were filtered by AAPT"
    assert not any(name.startswith("lib/") for name in names), "Unexpected native library payload"
    count = 0
    for source in assets.rglob("*"):
        if source.is_file():
            entry = "assets/" + source.relative_to(assets).as_posix()
            assert archive.read(entry) == source.read_bytes(), f"Missing or changed asset: {entry}"
            count += 1
print(f"PASS: APK integrity and all {count} bundled assets, including Next.js chunks and route data")
