'use client';

import { useEffect, useState } from 'react';

const initial = { connected: false, playing: false, position: 0, duration: 0, sample: 'sdr', status: 'Connecting…', hdr10: false, hlg: false, frameRendered: false };
const clock = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
function command(type, extra = {}) { window.NavigatorPlayer?.postMessage(JSON.stringify({ type, ...extra })); }
function Icon({ name }) {
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {name === 'pause' ? <><path d="M8 5v14M16 5v14" /></> : name === 'play' ? <path d="m8 5 11 7-11 7Z" /> : name === 'sound' ? <><path d="m11 5-6 4H2v6h3l6 4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></> : name === 'muted' ? <><path d="m11 5-6 4H2v6h3l6 4Z" /><path d="m16 9 6 6m0-6-6 6" /></> : <><path d="M12 8v5l3 2" /><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /></>}
    </svg>;
}

export default function PlaybackDemo() {
    const [state, setState] = useState(initial);
    const [scrub, setScrub] = useState(null);
    useEffect(() => {
        const bridge = window.NavigatorPlayer;
        if (!bridge) return;
        bridge.onmessage = (event) => {
            try { setState({ ...JSON.parse(event.data), connected: true }); } catch { /* Ignore malformed native messages. */ }
        };
        command('ready');
        return () => { bridge.onmessage = null; };
    }, []);

    const disabled = !state.connected;
    return <main>
        <header className="top">
            <div className="brand"><img src="/assets/web/navigator.png" width="32" height="32" alt="" /><div><strong>Navigator</strong><span>Android playback demo</span></div></div>
            <span className="badge"><i className={state.frameRendered ? 'live' : ''} />{state.frameRendered ? 'Native video' : state.status}</span>
        </header>
        <section className="bottom" aria-label="Playback controls">
            <div className="caption"><span className="eyebrow">EXOPLAYER + NEXT.JS</span><h1>{state.sample === 'pq' ? 'HDR10 test pattern' : state.sample === 'hlg' ? 'HLG test pattern' : 'SDR motion test'}</h1><p>Native video. React controls.</p></div>
            <div className="controls">
                <div className="sample-row" aria-label="Test clips">
                    <button data-testid="sample-sdr" aria-pressed={state.sample === 'sdr'} disabled={disabled} onClick={() => command('load', { sample: 'sdr' })}>SDR</button>
                    <button data-testid="sample-pq" aria-pressed={state.sample === 'pq'} disabled={disabled || !state.hdr10} onClick={() => command('load', { sample: 'pq' })}>HDR10{!state.hdr10 && ' · unavailable'}</button>
                    <button data-testid="sample-hlg" aria-pressed={state.sample === 'hlg'} disabled={disabled || !state.hlg} onClick={() => command('load', { sample: 'hlg' })}>HLG{!state.hlg && ' · unavailable'}</button>
                </div>
                <label className="sr-only" htmlFor="seek">Playback position</label>
                <input id="seek" data-testid="seek" type="range" min="0" max={Math.max(1, state.duration)} step="100" value={scrub ?? state.position} disabled={disabled || !state.duration}
                    onChange={(event) => setScrub(Number(event.target.value))}
                    onPointerUp={(event) => { command('seek', { position: Number(event.currentTarget.value) }); setScrub(null); }}
                    onPointerCancel={() => setScrub(null)}
                    onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) { command('seek', { position: Number(event.currentTarget.value) }); setScrub(null); } }} />
                <div className="transport">
                    <button data-testid="toggle" className="primary icon" aria-label={state.playing ? 'Pause' : 'Play'} disabled={disabled} onClick={() => command('toggle')}><Icon name={state.playing ? 'pause' : 'play'} /></button>
                    <button className="icon" aria-label="Restart video" disabled={disabled} onClick={() => command('seek', { position: 0 })}><Icon name="restart" /></button>
                    <span className="time">{clock(scrub ?? state.position)} <span>/ {clock(state.duration)}</span></span>
                    <button className="icon mute" aria-label={state.muted ? 'Unmute' : 'Mute'} disabled={disabled} onClick={() => command('mute')}><Icon name={state.muted ? 'muted' : 'sound'} /></button>
                </div>
                <p className="status" role="status" data-testid="status">{state.error || state.status}{state.sourceTransfer && ` · ${state.sourceTransfer} source`}</p>
            </div>
            <details className="diagnostics"><summary>Device & playback details</summary><dl>
                <div><dt>Display HDR</dt><dd>{state.displayHdr || 'Checking…'}</dd></div>
                <div><dt>Decoder</dt><dd>{state.decoder || 'Waiting for video'}</dd></div>
                <div><dt>Rendered frames</dt><dd>{state.renderedFrames ?? 0}</dd></div>
                <div><dt>UI</dt><dd>Bundled Next.js · transparent WebView</dd></div>
                <div><dt>Video</dt><dd>Media3 ExoPlayer · SurfaceView</dd></div>
            </dl><p>Generated signal tests, not a calibrated HDR comparison. HDR options require display and HEVC decoder support.</p></details>
            <p className="offline">All three clips and the UI are bundled. No account or internet needed.</p>
        </section>
    </main>;
}
