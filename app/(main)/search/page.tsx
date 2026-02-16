import { searchCatalogSections } from "@/app/actions";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { MediaCard } from "@/components/media-card";
import { SearchBar } from "@/components/search-component";
import { SearchIcon } from "lucide-react";
import type { SearchCatalogSection, SearchResult, MediaItem } from "@/types/stremio";

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = (await searchParams).q;

  const sections = await searchCatalogSections(query as string);
  const renderableSections = sections
    .map((section): SearchCatalogSection => ({
      ...section,
      items: section.items.filter(
        (item) => item.type === "movie" || item.type === "series"
      ),
    }))
    .filter((section) => section.items.length > 0);

  const totalResults = renderableSections.reduce(
    (count, section) => count + section.items.length,
    0
  );

  const toMediaItem = (item: SearchResult): MediaItem => ({
    id: item.id,
    type: item.type as Extract<MediaItem["type"], "movie" | "series">,
    name: item.name,
    poster: item.poster,
    description: item.description,
    releaseInfo: item.releaseInfo,
    imdbRating: item.imdbRating,
  });

  const renderItems = (items: SearchResult[]) => (
    <div className="flex flex-row flex-wrap gap-8">
      {items.map((item) => (
        <div key={`${item.id}-${item.catalogId ?? "default"}`} className="flex-shrink-0">
          <MediaCard item={toMediaItem(item)} />
        </div>
      ))}
    </div>
  );

  const renderEmptyState = (type: string) => (
    <div className="text-center p-8">
      <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p className="text-muted-foreground">
        No {type.toLowerCase()} found for &quot;{query}&quot;
      </p>
    </div>
  );

  return (
    <div className="relative px-4 py-6 max-w-full">
      <VibrantAuroraBackground amplitude={0.8} blend={0.4} />

      <div className="relative z-[9999] mb-8">
        <div className="mb-6">
          <SearchBar />
        </div>
      </div>

      <div className="relative z-10 mb-2">
        <h2 className="text-3xl font-semibold text-foreground mb-2 font-poppins">
          &quot;{query}&quot;
        </h2>
        <p className="text-muted-foreground mb-6 inline-flex items-center">
          <SearchIcon className="h-4 w-4 mr-2" />
          Found {totalResults} results for &quot;{query}&quot;
        </p>
      </div>

      <section className="relative z-10 mb-12">
        {renderableSections.length > 0 ? (
          <div className="space-y-12">
            {renderableSections.map((section) => (
              <div key={section.key}>
                <h3 className="text-2xl font-semibold text-foreground mb-1 font-poppins">
                  {section.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {section.items.length} items found
                </p>
                {renderItems(section.items)}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-8">
            <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No results found for &quot;{query}&quot;
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
