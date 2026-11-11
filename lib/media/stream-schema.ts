import { z } from "zod";
import type { StremioStream } from "@/types/stremio";

const headers = z.record(z.string(), z.string());
const stream = z.object({
    url: z.string().optional(), externalUrl: z.string().optional(), ytId: z.string().optional(),
    infoHash: z.string().optional(), fileIdx: z.number().int().nonnegative().optional(),
    name: z.string().optional(), title: z.string().optional(), description: z.string().optional(),
    behaviorHints: z.object({
        notWebReady: z.boolean().optional(), filename: z.string().optional(),
        videoSize: z.number().nonnegative().optional(), videoHash: z.string().optional(),
        proxyHeaders: z.object({ request: headers.optional(), response: headers.optional() }).passthrough().optional(),
    }).passthrough().optional(),
    subtitles: z.array(z.object({ id: z.string(), url: z.string(), lang: z.string(), label: z.string().optional() }).passthrough()).optional(),
}).passthrough();

/** Preserve valid extension/torrent records; one bad record cannot poison a
 * healthy provider, and malformed envelopes never become cacheable successes. */
export function parseStreamResponse(input: unknown): StremioStream[] {
    const envelope = z.object({ streams: z.array(z.unknown()) }).parse(input);
    const result: StremioStream[] = [];
    for (const value of envelope.streams) {
        const parsed = stream.safeParse(value);
        if (parsed.success) result.push(parsed.data);
    }
    return result;
}
