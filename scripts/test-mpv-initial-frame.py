"""Decode generated media with the bundled libmpv; no app, GUI, or HTTP server.

Requires ffmpeg. The image VO verifies the first decoded frame, not the macOS
compositor, GPU presentation, or network-stream performance.
"""
import ctypes as c
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

library = os.environ.get("NAVIGATOR_TEST_LIBMPV", str(Path(__file__).resolve().parents[1] / "desktop/vendor/macos-aarch64/libmpv.2.dylib"))
mpv = c.CDLL(library)
mpv.mpv_create.restype = c.c_void_p
mpv.mpv_set_option_string.argtypes = [c.c_void_p, c.c_char_p, c.c_char_p]
mpv.mpv_initialize.argtypes = [c.c_void_p]
mpv.mpv_command.argtypes = [c.c_void_p, c.POINTER(c.c_char_p)]
mpv.mpv_terminate_destroy.argtypes = [c.c_void_p]

class Event(c.Structure):
    _fields_ = [("event_id", c.c_int), ("error", c.c_int), ("reply_userdata", c.c_uint64), ("data", c.c_void_p)]

mpv.mpv_wait_event.argtypes = [c.c_void_p, c.c_double]
mpv.mpv_wait_event.restype = c.POINTER(Event)

def ffmpeg(*args):
    return subprocess.check_output(["ffmpeg", "-hide_banner", "-loglevel", "error", *args])

with tempfile.TemporaryDirectory(prefix="navigator-initial-frame-") as temp:
    directory = Path(temp)
    video = directory / "red-then-blue.mp4"
    frames = directory / "frames"
    frames.mkdir()
    ffmpeg("-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=10:d=3", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=10:d=3", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "20", "-sc_threshold", "0", "-movflags", "+faststart", str(video))
    handle = mpv.mpv_create()
    assert handle
    try:
        for name, value in {"config": "no", "vo": "image", "ao": "null", "idle": "yes", "terminal": "no", "hwdec": "no", "frames": "1", "vo-image-format": "png", "vo-image-outdir": str(frames)}.items():
            assert mpv.mpv_set_option_string(handle, name.encode(), value.encode()) >= 0, name
        assert mpv.mpv_initialize(handle) >= 0
        results = []
        for label, start, expected in [("previous load-before-seek path", None, "red"), ("initial resume at 3.2 seconds", 3.2, "blue"), ("fresh replacement at zero", 0, "red")]:
            # The image VO restarts its file numbering for each source.
            for image in frames.glob("*.png"):
                image.unlink()
            before = set(frames.glob("*.png"))
            command = ["loadfile", str(video), "replace"]
            if start is not None:
                command += ["-1", f"start=+{start},hr-seek=yes" if start > 0 else "start=none"]
            args = (c.c_char_p * (len(command) + 1))(*[arg.encode() for arg in command], None)
            began = time.monotonic()
            assert mpv.mpv_command(handle, args) >= 0
            while time.monotonic() - began < 10:
                event = mpv.mpv_wait_event(handle, 0.1).contents
                if event.event_id == 7:  # END_FILE, after frames=1
                    assert event.error >= 0
                    break
            else:
                raise AssertionError("Timed out decoding the first frame")
            images = set(frames.glob("*.png")) - before
            assert len(images) == 1, (label, images)
            pixel = ffmpeg("-i", str(images.pop()), "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
            red, green, blue = pixel[:3]
            actual = "blue" if blue > red * 2 and blue > 150 else "red" if red > blue * 2 and red > 150 else "other"
            assert actual == expected, (label, list(pixel), expected)
            results.append({"case": label, "firstDecodedFrame": actual, "rgb": list(pixel), "seconds": round(time.monotonic() - began, 4)})
        print(json.dumps(results, indent=2))
    finally:
        mpv.mpv_terminate_destroy(handle)
