import { listSearchAddonTargets, searchCatalogSectionsForAddon } from "@/app/actions";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { MediaCard } from "@/components/media-card";
import { SearchBar } from "@/components/search-component";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";
import type { SearchResult, MediaItem } from "@/types/stremio";

type SearchAddonTarget = Awaited<ReturnType<typeof listSearchAddonTargets>>[number];

const catalogTypePriority: Record<string, number> = {
  movie: 1,
  series: 2,
};

function toMediaItem(item: SearchResult): MediaItem {
  return {
    id: item.id,
    type: item.type as Extract<MediaItem["type"], "movie" | "series">,
    name: item.name,
    poster: item.poster,
    description: item.description,
    releaseInfo: item.releaseInfo,
    imdbRating: item.imdbRating,
  };
}

function normalizeQueryParam(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function AddonSectionSkeleton({ addonName }: { addonName: string }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SearchIcon className="h-4 w-4" />
          <span>Searching {addonName}...</span>
        </div>
      </div>
      <div className="flex flex-row flex-wrap gap-8">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={`${addonName}-skeleton-${index}`}
            className="h-[320px] w-[210px] rounded-xl"
          />
        ))}
      </div>
    </div>
  );
}

async function AddonSection({
  query,
  target,
}: {
  query: string;
  target: SearchAddonTarget;
}) {
  const sections = await searchCatalogSectionsForAddon(query, target.transportUrl);
  const renderableSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.type === "movie" || item.type === "series"
      ),
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => {
      const ap = catalogTypePriority[a.catalogType] ?? 99;
      const bp = catalogTypePriority[b.catalogType] ?? 99;
      if (ap !== bp) return ap - bp;
      return a.title.localeCompare(b.title);
    });

  if (renderableSections.length === 0) return null;

  return (
    <div className="space-y-12">
      {renderableSections.map((section) => (
        <div key={`${target.transportUrl}-${section.key}`}>
          <h3 className="text-2xl font-semibold text-foreground mb-1 font-poppins">
            {section.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {section.items.length} items found
          </p>
          <div className="flex flex-row flex-wrap gap-8">
            {section.items.map((item) => (
              <div
                key={`${item.id}-${item.catalogId ?? "default"}`}
                className="flex-shrink-0"
              >
                <MediaCard item={toMediaItem(item)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function SearchResultsByAddon({ query }: { query: string }) {
  const addonTargets = await listSearchAddonTargets();

  if (addonTargets.length === 0) {
    return (
      <div className="text-center p-8">
        <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          No searchable addons are installed yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {addonTargets.map((target) => (
        <Suspense
          key={target.transportUrl}
          fallback={<AddonSectionSkeleton addonName={target.addonName} />}
        >
          <AddonSection query={query} target={target} />
        </Suspense>
      ))}
    </div>
  );
}

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const query = normalizeQueryParam(params.q);

  return (
    <div className="relative px-4 py-6 max-w-full">
      <VibrantAuroraBackground amplitude={0.8} blend={0.4} />

      <div className="relative z-[9999] mb-8">
        <div className="mb-6">
          <Suspense fallback={null}>
            <SearchBar initialQuery={query} />
          </Suspense>
        </div>
      </div>

      <section className="relative z-10 mb-12">
        {query ? (
          <SearchResultsByAddon query={query} />
        ) : (
          <div className="text-center p-8">
            <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Start typing to search.</p>
          </div>
        )}
      </section>
    </div>
  );
}
