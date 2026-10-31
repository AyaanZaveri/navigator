"""Verify the installed app's bridge payload, not just the source tree."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
apk = root / "app/build/outputs/apk/debug/app-debug.apk"
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None, "Corrupt APK entry"
    names = archive.namelist()
    assert "AndroidManifest.xml" in names and "classes.dex" in names, "Expected a direct APK, not an outer artifact ZIP"
    assert archive.read("assets/bridge.js") == (root / "app/src/main/assets/bridge.js").read_bytes(), "Stale or missing bridge"
    assert archive.read("assets/edge-to-edge.css") == (root / "app/src/main/assets/edge-to-edge.css").read_bytes(), "Stale or missing edge-to-edge styles"
    assert archive.read("assets/touch-controls.js") == (root / "app/src/main/assets/touch-controls.js").read_bytes(), "Stale or missing touch controls"
    assert archive.read("assets/back-navigation.js") == (root / "app/src/main/assets/back-navigation.js").read_bytes(), "Stale or missing back navigation"
    assert archive.read("assets/player-ui.js") == (root / "app/src/main/assets/player-ui.js").read_bytes(), "Stale or missing player UI hooks"
    assert archive.read("assets/web-scrub.js") == (root / "app/src/main/assets/web-scrub.js").read_bytes(), "Stale or missing web scrub adapter"
    assert not any(any(part.startswith(".env") for part in Path(name).parts) or name.startswith("assets/media/") for name in names), "Unexpected credentials or demo payload"
    assert not any(name.startswith("lib/") for name in names), "Unexpected native codec libraries"
print("PASS: APK integrity, bridge payload, and direct installable APK structure")
