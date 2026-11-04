import "server-only";
import { z } from "zod";

const searchSchema = z.object({ results: z.array(z.object({
    title: z.string(), snippet: z.string().optional(), url: z.string().url(),
})) });
const fetchSchema = z.object({
    results: z.array(z.object({ url: z.string(), final_url: z.string().optional(), title: z.string().nullish(), text: z.string() })),
    errors: z.array(z.object({ url: z.string(), error: z.unknown(), status: z.number().optional() })).default([]),
});

export interface WebEvidence { id: string; title: string; url: string; text: string }

function publicUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password
            && !/^(localhost|.*\.local|.*\.localhost|[\d.]+|\[.*\])$/i.test(url.hostname);
    } catch { return false; }
}

async function request(url: string, apiKey: string, signal: AbortSignal | undefined, body?: unknown) {
    const timeout = AbortSignal.timeout(body ? 20_000 : 10_000);
    try {
        const response = await fetch(url, {
            method: body ? "POST" : "GET",
            headers: { "X-API-Key": apiKey, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        if (response.status === 401 || response.status === 403) throw new Error("TinyFish rejected the API key or access. Check TinyFish in Settings.");
        if (response.status === 402 || response.status === 429) throw new Error("TinyFish has reached its usage allowance. Try again later or check your TinyFish account.");
        if (!response.ok) throw new Error("TinyFish web search is unavailable. Try again shortly.");
        return await response.json();
    } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && error.message.startsWith("TinyFish")) throw error;
        throw new Error("Could not reach TinyFish. Check your connection and try again.");
    }
}

export async function searchTinyfish(query: string, purpose: string, apiKey: string, signal?: AbortSignal) {
    const url = new URL("https://api.search.tinyfish.ai/");
    url.searchParams.set("query", query);
    url.searchParams.set("purpose", purpose);
    return searchSchema.parse(await request(url.toString(), apiKey, signal)).results.filter(item => publicUrl(item.url));
}

/** Score overlapping passages instead of cutting a page at the start. Keep text verbatim for evidence checks. */
export function webPassages(text: string, query: string): string {
    if (text.length <= 10_000) return text;
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])]
        .filter(term => !/^(the|for|you|where|episode|season|show|which|that|with|from|goes|about)$/.test(term));
    const lower = text.toLowerCase();
    const weights = terms.map(term => ({ term, weight: 1 / Math.max(1, lower.split(term).length - 1) }));
    const chunks = Array.from({ length: Math.ceil(text.length / 1200) }, (_, index) => {
        const start = Math.max(0, index * 1200 - 300);
        const passage = text.slice(start, start + 1800);
        return { start, passage, score: weights.reduce((sum, { term, weight }) => sum + (passage.toLowerCase().includes(term) ? weight : 0), 0) };
    });
    return [text.slice(0, 800), ...chunks.sort((a, b) => b.score - a.score).slice(0, 5)
        .sort((a, b) => a.start - b.start).map(chunk => chunk.passage)].join("\n\n[…]\n\n");
}

export async function researchMediaWeb(query: string, purpose: string, apiKey: string, signal?: AbortSignal): Promise<WebEvidence[]> {
    const results = await searchTinyfish(query, purpose, apiKey, signal);
    const ranked = results.map((item, index) => {
        const host = new URL(item.url).hostname;
        const preferred = /(^|\.)(wikipedia\.org|bbc\.(com|co\.uk)|cc\.com|paramountplus\.com|nbc\.com|abc\.com|avclub\.com|vulture\.com)$/.test(host);
        const social = /(^|\.)(youtube\.com|facebook\.com|instagram\.com|reddit\.com|tiktok\.com)$/.test(host);
        return { ...item, score: (preferred ? 15 : 0) - (social ? 15 : 0) - index };
    }).sort((a, b) => b.score - a.score);
    const urls = [...new Set(ranked.map(item => item.url))].slice(0, 2);
    if (!urls.length) return [];
    const data = fetchSchema.parse(await request("https://api.fetch.tinyfish.ai/", apiKey, signal, {
        urls, purpose, format: "markdown", per_url_timeout_ms: 15_000,
    }));
    const sources = data.results.filter(item => urls.includes(item.url) && publicUrl(item.final_url || item.url)
        && item.text.trim() && !/\b(sign in|log in|captcha|access denied)\b/i.test(item.title || ""))
        .map((item, index) => ({ id: `web:${index + 1}`, url: item.final_url || item.url,
            title: item.title || new URL(item.url).hostname, text: webPassages(item.text, query) }));
    if (!sources.length && data.errors.length) throw new Error("TinyFish could not read the matching sources. Try another description.");
    return sources;
}
