import { getAuthData } from "@/lib/server/auth";
import { outboundFetch } from "@/lib/server/outbound-fetch";
import { NextResponse } from "next/server";

type CerebrasModelResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export async function GET(req: Request) {
    try { await getAuthData(); } catch { return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } }); }
  try {
    const apiKey =
      req.headers.get("x-cerebras-api-key")?.trim() ||
      process.env.CEREBRAS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Cerebras API key is required to fetch models." },
        { status: 400 }
      );
    }

    const upstream = await outboundFetch("https://api.cerebras.ai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store", redirect: "error",
    }, { provider: true, maxBytes: 1024 * 1024, timeoutMs: 10_000 });

    if (!upstream.ok) {
      const errorBody = await upstream.text();
      return NextResponse.json(
        {
          error: "Failed to fetch Cerebras models.",
          details: errorBody,
        },
        { status: upstream.status }
      );
    }

    const payload = (await upstream.json()) as CerebrasModelResponse;
    const models = (payload.data ?? [])
      .map((model) => model.id)
      .filter((modelId): modelId is string => typeof modelId === "string")
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Cerebras models API error:", error);
    return NextResponse.json(
      { error: "Unexpected error while fetching Cerebras models." },
      { status: 500 }
    );
  }
}
