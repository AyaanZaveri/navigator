import "server-only";
import { z } from "zod";

const searchSchema = z.object({ results: z.array(z.object({
    title: z.string(), snippet: z.string().optional(), url: z.string().url(), position: z.number().optional(), site_name: z.string().optional(),
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
            cache: "no-store", redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
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

/** Rank the actual clue, rather than promoting generic encyclopedias over dialogue/scene sources. */
export function rankMediaSources<T extends { title: string; snippet?: string; url: string }>(results: T[], query: string): T[] {
    const tokens = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
    const terms = [...tokens(query)].filter(term => !/^(the|where|when|she|they|says|said|episode|show|scene|from|with|that|this|goes|into|what|which)$/.test(term));
    const titlePhrase = /["“]([^"”]+)["”]/.exec(query)?.[1].toLowerCase();
    const documents = results.map(item => tokens(`${item.title} ${item.snippet || ""}`));
    const weights = terms.map(term => ({ term, weight: Math.log(1 + results.length / (1 + documents.filter(doc => doc.has(term)).length)) }));
    return results.map((item, index) => {
        const title = tokens(item.title);
        const identity = titlePhrase ? item.title.toLowerCase().includes(titlePhrase) ? 4 : item.snippet?.toLowerCase().includes(titlePhrase) ? 2 : 0 : 0;
        const relevance = weights.reduce((sum, { term, weight }) => sum + (title.has(term) ? 2 : documents[index].has(term) ? 1 : 0) * weight, 0);
        return { item, score: identity + relevance / Math.sqrt(1 + (item.snippet?.length || 0) / 1000) - index * 0.05 };
    }).sort((a, b) => b.score - a.score).map(({ item }) => item);
}

export async function fetchMediaWebSources(urls: string[], purpose: string, apiKey: string, signal?: AbortSignal, query = purpose): Promise<WebEvidence[]> {
    if (!urls.length || urls.length > 10 || urls.some(url => !publicUrl(url))) throw new Error("Provide up to ten public HTTPS source URLs.");
    const data = fetchSchema.parse(await request("https://api.fetch.tinyfish.ai/", apiKey, signal, {
        urls, purpose, format: "markdown", per_url_timeout_ms: 10_000,
    }));
    const sources = data.results.filter(item => urls.includes(item.url) && publicUrl(item.final_url || item.url)
        && item.text.trim() && !/\b(sign in|log in|captcha|access denied|site maintenance)\b/i.test(item.title || ""))
        .map((item, index) => ({ id: `web:${index + 1}`, url: item.final_url || item.url,
            title: item.title || new URL(item.url).hostname, text: webPassages(item.text, query) }));
    if (!sources.length && data.errors.length) throw new Error("TinyFish could not read the matching sources. Try another description.");
    return sources;
}

export async function researchMediaWeb(query: string, purpose: string, apiKey: string, signal?: AbortSignal,
    onSearchResults?: (_results: Awaited<ReturnType<typeof searchTinyfish>>) => void): Promise<WebEvidence[]> {
    const results = await searchTinyfish(query, purpose, apiKey, signal);
    onSearchResults?.(results);
    const urls = [...new Set(rankMediaSources(results, query).map(item => item.url))].slice(0, 4);
    return urls.length ? fetchMediaWebSources(urls, purpose, apiKey, signal, query) : [];
}
