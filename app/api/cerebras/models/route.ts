import { NextResponse } from "next/server";

type CerebrasModelResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export async function GET(req: Request) {
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

    const upstream = await fetch("https://api.cerebras.ai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

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
