import { NextResponse } from "next/server";
import { getInstalledAddons } from "@/app/actions/auth";
import type { StremioAddon, StremioStreamResponse } from "@/types/stremio";

function addonSupportsStream(addon: StremioAddon, type?: string): boolean {
  return addon.manifest.resources.some((resource) => {
    if (typeof resource === "string") {
      return resource === "stream";
    }
    if (resource.name !== "stream") return false;
    if (!type) return true;
    if (!resource.types || resource.types.length === 0) return true;
    return resource.types.includes(type);
  });
}

async function fetchAddonStreams(
  transportUrl: string,
  mediaItemId: string,
  type: string
) {
  const base = transportUrl.replace(/\/manifest\.json$/, "");
  const response = await fetch(`${base}/stream/${type}/${mediaItemId}.json`, {
    headers: {
      Referer: "https://web.stremio.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as StremioStreamResponse;
  return data.streams ?? [];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaItemId = searchParams.get("mediaItemId");
    const type = searchParams.get("type") ?? "movie";
    const addonId = searchParams.get("addonId");

    if (!mediaItemId || !addonId) {
      return NextResponse.json({ streams: [] }, { status: 400 });
    }

    const addons = await getInstalledAddons();
    const addon = addons.find(
      (candidate) => (candidate.manifest.id || candidate.transportUrl) === addonId
    );

    if (!addon || !addonSupportsStream(addon, type)) {
      return NextResponse.json({ streams: [] }, { status: 404 });
    }

    const streams = await fetchAddonStreams(addon.transportUrl, mediaItemId, type);

    return NextResponse.json({
      streams: streams.map((stream) => ({
        ...stream,
        name: stream.name || addon.manifest.name || "Unknown source",
      })),
    });
  } catch (error: any) {
    if (error?.message?.includes("Not authenticated")) {
      return NextResponse.json({ streams: [] }, { status: 401 });
    }
    console.error("Failed to fetch addon streams:", error);
    return NextResponse.json({ streams: [] }, { status: 500 });
  }
}
