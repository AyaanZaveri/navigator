import { getAuthData } from "@/lib/server/auth";
import { outboundFetch } from "@/lib/server/outbound-fetch";
import { NextResponse } from "next/server";
import { OPENAI_DEFAULT_BASE_URL } from "@/lib/models-dev";

export async function POST(req: Request) {
    try { await getAuthData(); } catch { return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } }); }
    const respond = (body: unknown, status = 200) => NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
    let endpoint: URL;
    let officialOpenAI = false;
    try {
        const { baseUrl } = await req.json();
        if (typeof baseUrl !== "string") throw new Error("Missing base URL");
        endpoint = new URL(baseUrl.trim());
        if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
            throw new Error("Invalid base URL");
        }
        officialOpenAI = endpoint.origin === new URL(OPENAI_DEFAULT_BASE_URL).origin
            && endpoint.pathname.replace(/\/+$/, "") === "/v1" && !endpoint.search;
        endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/models`;
        endpoint.hash = "";
    } catch {
        return respond({ error: "Enter a valid HTTP or HTTPS base URL." }, 400);
    }

    // A custom provider must never receive the server's shared OpenAI key.
    const apiKey = req.headers.get("x-openai-api-key")?.trim()
        || (officialOpenAI ? process.env.OPENAI_API_KEY?.trim() : "");
    const timeout = AbortSignal.timeout(10_000);
    try {
        const upstream = await outboundFetch(endpoint, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.any([req.signal, timeout]),
        }, { provider: true, maxBytes: 1024 * 1024, timeoutMs: 10_000 });
        if (!upstream.ok) {
            const error = upstream.status === 401
                ? "The API key was rejected. Check the key for this base URL."
                : upstream.status === 403
                    ? "The provider refused access to its models endpoint."
                    : upstream.status === 404
                        ? "This provider has no models endpoint at this base URL. Enter a model ID manually."
                        : "The provider could not load models. Try again.";
            await upstream.body?.cancel();
            return respond({ error }, upstream.status);
        }

        const payload = await upstream.json() as { data?: Array<{ id?: unknown; name?: unknown }> };
        if (!Array.isArray(payload.data)) {
            return respond({ error: "The provider returned an invalid model list." }, 502);
        }
        const models = new Map<string, { id: string; name: string }>();
        for (const model of payload.data) {
            if (typeof model?.id !== "string" || !model.id.trim()) continue;
            const id = model.id.trim();
            models.set(id, { id, name: typeof model.name === "string" && model.name.trim() ? model.name.trim() : id });
        }
        return respond({ models: [...models.values()].sort((a, b) => a.name.localeCompare(b.name)) });
    } catch {
        return respond({ error: timeout.aborted
            ? "Loading models timed out. You can still enter a model ID manually."
            : "Couldn’t connect to the models endpoint. Check the base URL and try again." }, timeout.aborted ? 504 : 502);
    }
}
