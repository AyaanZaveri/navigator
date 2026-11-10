export type Chapter = { startTime: number; endTime: number; text: string };
export type ChapterMarker = { time: number; title?: string };

/** Treat chapter starts as boundaries; reject corrupt markers and duplicate times. */
export function chapterCues(markers: ChapterMarker[], duration: number): Chapter[] {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const sorted = markers.filter(marker => Number.isFinite(marker.time) && marker.time >= 0 && marker.time < duration)
        .sort((a, b) => a.time - b.time).filter((marker, index, all) => !index || marker.time !== all[index - 1].time);
    return sorted.map((marker, index) => ({ startTime: marker.time, endTime: sorted[index + 1]?.time ?? duration,
        text: marker.title?.trim() || `Chapter ${index + 1}` }));
}

type Element = { id: number; start: number; end: number };
function vint(bytes: Uint8Array, offset: number, id = false) {
    const first = bytes[offset];
    if (!first) throw Error('Invalid EBML integer');
    let length = 1, mask = 128;
    while (!(first & mask)) { length++; mask /= 2; }
    if (length > (id ? 4 : 8) || offset + length > bytes.length) throw Error('Truncated EBML integer');
    let value = id ? first : first & (mask - 1);
    let unknown = !id && value === mask - 1;
    for (let i = 1; i < length; i++) { value = value * 256 + bytes[offset + i]; unknown &&= bytes[offset + i] === 255; }
    if (!unknown && !Number.isSafeInteger(value)) throw Error('Unsafe EBML size');
    return { value: unknown ? Infinity : value, length };
}
function element(bytes: Uint8Array, offset: number): Element {
    const id = vint(bytes, offset, true), size = vint(bytes, offset + id.length);
    const start = offset + id.length + size.length;
    return { id: id.value, start, end: start + size.value };
}
function children(bytes: Uint8Array, start: number, end: number): Element[] {
    const list: Element[] = [];
    for (let offset = start; offset < Math.min(end, bytes.length) && list.length < 4096;) {
        const item = element(bytes, offset);
        if (item.end > bytes.length) break;
        list.push(item); offset = item.end;
    }
    return list;
}
function uint(bytes: Uint8Array, item?: Element): number {
    if (!item || item.end - item.start > 8) return NaN;
    let value = 0;
    for (let i = item.start; i < item.end; i++) value = value * 256 + bytes[i];
    return Number.isSafeInteger(value) ? value : NaN;
}
const CHAPTERS = 0x1043a770;
export function parseMatroskaChapters(bytes: Uint8Array): ChapterMarker[] {
    const root = element(bytes, 0);
    if (root.id !== CHAPTERS || root.end > bytes.length) return [];
    const editions = children(bytes, root.start, root.end).filter(item => item.id === 0x45b9);
    const fields = (item: Element) => children(bytes, item.start, item.end);
    const edition = editions.find(item => uint(bytes, fields(item).find(field => field.id === 0x45db)) === 1) ?? editions[0];
    if (!edition) return [];
    const items = fields(edition);
    // Ordered/linked editions have virtual times; only the native demuxer can map them.
    if (uint(bytes, items.find(item => item.id === 0x45dd)) === 1) return [];
    return items.filter(item => item.id === 0xb6).slice(0, 512).flatMap(atom => {
        const items = fields(atom);
        if (uint(bytes, items.find(item => item.id === 0x98)) === 1 || uint(bytes, items.find(item => item.id === 0x4598)) === 0) return [];
        const time = uint(bytes, items.find(item => item.id === 0x91)) / 1e9;
        const display = items.find(item => item.id === 0x80);
        const title = display && fields(display).find(item => item.id === 0x85);
        return Number.isFinite(time) ? [{ time, title: title ? new TextDecoder().decode(bytes.subarray(title.start, title.end)).replace(/\0/g, '').slice(0, 256) : undefined }] : [];
    });
}

/** Metadata only: at most two 256 KiB HTTP ranges, never a full video download. */
export async function readEmbeddedChapters(source: string, signal: AbortSignal): Promise<ChapterMarker[]> {
    const size = 256 * 1024;
    async function range(start: number) {
        const response = await fetch(source, { headers: { Range: `bytes=${start}-${start + size - 1}` }, signal });
        if (response.status !== 206) { await response.body?.cancel(); throw Error('Chapter metadata requires HTTP ranges'); }
        const contentRange = response.headers.get('content-range');
        if (contentRange && !contentRange.startsWith(`bytes ${start}-`)) { await response.body?.cancel(); throw Error('Incorrect chapter range'); }
        const reader = response.body?.getReader();
        if (!reader) throw Error('Missing chapter response');
        const chunks: Uint8Array[] = []; let length = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                length += value.length;
                if (length > size) throw Error('Chapter range too large');
                chunks.push(value);
            }
        } finally { await reader.cancel(); }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return bytes;
    }
    const bytes = await range(0);
    if (element(bytes, 0).id !== 0x1a45dfa3) return [];
    const segment = element(bytes, element(bytes, 0).end);
    if (segment.id !== 0x18538067) return [];
    let position: number | undefined;
    for (let offset = segment.start; offset < bytes.length;) {
        const item = element(bytes, offset);
        if (item.id === CHAPTERS && item.end <= bytes.length) return parseMatroskaChapters(bytes.subarray(offset, item.end));
        if (item.id === 0x114d9b74 && item.end <= bytes.length) {
            for (const seek of children(bytes, item.start, item.end).filter(item => item.id === 0x4dbb)) {
                const fields = children(bytes, seek.start, seek.end);
                if (uint(bytes, fields.find(item => item.id === 0x53ab)) === CHAPTERS) {
                    const relative = uint(bytes, fields.find(item => item.id === 0x53ac));
                    if (Number.isSafeInteger(relative) && relative >= 0) position = segment.start + relative;
                }
            }
        }
        if (!Number.isFinite(item.end) || item.end > bytes.length) break;
        offset = item.end;
    }
    if (position === undefined || !Number.isSafeInteger(position)) return [];
    return parseMatroskaChapters(await range(position));
}
