import { fetchCatalogItems } from "@/app/actions/media";
import type { HomeCatalogEntry, HomeCatalogSection } from "@/lib/home-catalogs";
import { NextResponse } from "next/server";

const MAX_BATCH_SIZE = 6;
const MAX_ITEMS_PER_SECTION = 12;

function isHomeCatalogEntry(value: unknown): value is HomeCatalogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HomeCatalogEntry>;
  return (
    typeof entry.key === "string" &&
    typeof entry.sectionName === "string" &&
    typeof entry.catalogType === "string" &&
    typeof entry.catalogId === "string" &&
    typeof entry.addonTransportUrl === "string"
  );
}

async function loadCatalogSection(
  entry: HomeCatalogEntry
): Promise<HomeCatalogSection | null> {
  const items = await fetchCatalogItems(
    entry.catalogType,
    entry.catalogId,
    entry.addonTransportUrl
  );

  const mediaItems = items.slice(0, MAX_ITEMS_PER_SECTION);
  if (mediaItems.length === 0) return null;

  return {
    key: entry.key,
    sectionName: entry.sectionName,
    mediaItems,
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { entries?: unknown };
    const entriesRaw = Array.isArray(payload.entries) ? payload.entries : [];
    const validatedEntries = entriesRaw.filter(isHomeCatalogEntry).slice(0, MAX_BATCH_SIZE);

    if (validatedEntries.length === 0) {
      return NextResponse.json({ sections: [] });
    }

    const loadedSections = await Promise.all(
      validatedEntries.map((entry) => loadCatalogSection(entry))
    );

    return NextResponse.json({
      sections: loadedSections.filter(
        (section): section is HomeCatalogSection => section !== null
      ),
    });
  } catch (error) {
    console.error("Failed to load home catalog batch:", error);
    return NextResponse.json(
      { error: "Failed to load home catalog batch" },
      { status: 500 }
    );
  }
}
