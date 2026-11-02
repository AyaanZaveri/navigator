"""Read-only live provider audit. Run manually: python3 scripts/audit-skip-providers.py.
Uses curl; no accounts, submissions, client impersonation, or stream creation.
"""
import concurrent.futures
import json
import subprocess
import urllib.parse

# Runtimes below are test inputs, not a claim that every release has this length.
CASES = [
    ("Modern Family S08E16 (short release)", "tt1442437", 8, 16, 1290),
    ("Modern Family S08E16 (SkipDB reference)", "tt1442437", 8, 16, 1342.1),
    ("Modern Family S08E15", "tt1442437", 8, 15, 1290),
    ("Modern Family S08E19", "tt1442437", 8, 19, 1292),
    ("Modern Family S01E01", "tt1442437", 1, 1, 1380),
    ("Game of Thrones S01E01", "tt0944947", 1, 1, 3720),
    ("Breaking Bad S01E01", "tt0903747", 1, 1, 3500),
    ("Loki S01E02", "tt9140554", 1, 2, 3195.48),
    ("Severance S01E01", "tt11280740", 1, 1, 3420),
    ("The Office S01E01", "tt0386676", 1, 1, 1400),
]


def lookup_jobs():
    for name, imdb, season, episode, duration in CASES:
        query = dict(imdb_id=imdb, season=season, episode=episode)
        endpoints = {
            "TheIntroDB": "https://api.theintrodb.org/v4/media?" + urllib.parse.urlencode(
                dict(query, duration_ms=round(duration * 1000), details="true", merge_unknown="false")),
            "IntroDB": "https://api.introdb.app/segments?" + urllib.parse.urlencode(query),
            "IntroHater": f"https://introhater.com/api/segments/{imdb}:{season}:{episode}",
            "SkipDB": "https://api.skipdb.tv/api/segments?" + urllib.parse.urlencode(
                dict(query, duration=duration, adjust="conservative")),
        }
        for provider, url in endpoints.items():
            yield name, provider, url, None
    for name, tmdb, imdb in [("Modern Family S08E16", 1421, "tt1442437"), ("Game of Thrones S01E01", 1399, "tt0944947")]:
        season, episode = (8, 16) if tmdb == 1421 else (1, 1)
        yield name, "PublicMetaDB authenticated API", f"https://publicmetadb.com/api/external/skips?tmdb_id={tmdb}&media_type=tv&season={season}&episode={episode}", None
        query = urllib.parse.urlencode(dict(filter=f'tmdb_id={tmdb} && media_type="tv"', perPage=1,
                                          fields="season,episode,intro_start_ms,intro_end_ms"))
        yield name, "PublicMetaDB public panel data", "https://api.publicmetadb.com/api/collections/skips/records?" + query, None
        yield name, "Stremio Skip Button", f"https://busy-jacinta-shugi-c2885b2e.koyeb.app/ranges/{imdb}%3A{season}%3A{episode}", None
        yield name, "Fed-Skips", f"https://fed-skips.pstream.mov/{imdb}/{season}/{episode}", None
        yield name, "The Open Skip Database", f"https://tosd.qtchaos.de/api/series/{tmdb}?season={season}&episode={episode}", None
    yield "dataset", "SkippTV", "https://raw.githubusercontent.com/rjousse18/skipp_tv/main/data.csv", None
    yield "access check (no file tokens)", "TorBox", "https://api.torbox.app/v1/api/stream/getstreamdata", None
    yield "read-only episode batch", "SkipMe.db", "https://database.skipme.deno.net/v3/movies", json.dumps([
        dict(imdb_id=imdb, season=s, episode=e, duration_ms=round(d * 1000)) for _, imdb, s, e, d in CASES[:2]
    ])


def probe(job):
    name, provider, url, body = job
    command = ["curl", "-sSL", "--max-time", "12", "-H", "Origin: http://localhost:3000",
               "-w", "\n%{http_code} %{time_total}", url]
    if body is not None:
        command += ["-H", "Content-Type: application/json", "--data-binary", body]
    result = subprocess.run(command, capture_output=True, text=True)
    text, _, status = result.stdout.rpartition("\n")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = text[:1000] or result.stderr.strip()
    return dict(case=name, provider=provider, url=url, status_time=status, curl_exit=result.returncode, data=data)


if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        print(json.dumps(list(executor.map(probe, lookup_jobs())), indent=2))
