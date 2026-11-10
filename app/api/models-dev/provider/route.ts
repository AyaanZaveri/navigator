import { NextResponse } from "next/server";
import {
  getModelsDevProviderById,
  matchModelsDevProvider,
  MODELS_DEV_API_URL,
  type ModelsDevApiResponse,
} from "@/lib/models-dev";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get("baseUrl")?.trim() ?? "";
  const providerId = searchParams.get("providerId")?.trim() ?? "";

  if (!baseUrl && !providerId) {
    return NextResponse.json(
      { error: "A baseUrl or providerId query parameter is required." },
      { status: 400 }
    );
  }

  try {
    // The full catalog exceeds the Next.js Data Cache item-size limit.
    const upstream = await fetch(MODELS_DEV_API_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch provider data from models.dev." },
        { status: upstream.status }
      );
    }

    const payload = (await upstream.json()) as ModelsDevApiResponse;
    const provider = providerId
      ? getModelsDevProviderById(payload, providerId)
      : matchModelsDevProvider(payload, baseUrl);

    return NextResponse.json({ provider }, {
      headers: { "Cache-Control": provider ? "public, max-age=3600" : "no-store" },
    });
  } catch (error) {
    console.error("models.dev provider lookup failed:", error);
    return NextResponse.json(
      { error: "Unexpected error while looking up models.dev provider data." },
      { status: 500 }
    );
  }
}
