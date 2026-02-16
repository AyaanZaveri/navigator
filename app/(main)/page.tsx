import { fetchCatalogItems, fetchResumeItems } from "@/app/actions/media";
import { getInstalledAddons } from "@/app/actions/auth";
import { AuthErrorHandler } from "@/app/components/auth-error-handler";
import { MediaSection } from "@/components/media-section";
import { SearchBar } from "@/components/search-component";
import { Skeleton } from "@/components/ui/skeleton";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import type { StremioAddonCatalog } from "@/types/stremio";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

function formatTypeLabel(type: string): string {
  return type
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCatalogLabel(catalogName: string | null, catalogId: string): string {
  const source = catalogName && catalogName.length > 0 ? catalogName : catalogId;
  return source
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function HomeSectionSkeleton({ title }: { title: string }) {
  return (
    <section className="relative z-10 mb-5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-semibold text-foreground font-poppins">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden pb-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={`${title}-skeleton-${index}`}
            className="h-[320px] w-[210px] rounded-xl flex-shrink-0"
          />
        ))}
      </div>
    </section>
  );
}

function HomeLoadingContent() {
  return (
    <div className="relative px-4 py-6 max-w-full overflow-hidden">
      <VibrantAuroraBackground
        amplitude={0.5}
        className="fixed inset-0 z-0 pointer-events-none opacity-40"
      />

      <div className="relative z-[9999] mb-8">
        <div className="mb-6">
          <Suspense fallback={null}>
            <SearchBar />
          </Suspense>
        </div>
      </div>

      <HomeSectionSkeleton title="Continue Watching" />
      {Array.from({ length: 3 }).map((_, index) => (
        <HomeSectionSkeleton
          key={`home-loading-section-${index}`}
          title="Loading recommendations"
        />
      ))}
    </div>
  );
}

async function HomeContent() {
  let catalogSections: { sectionName: string; items: any[] }[] = [];
  let continueWatchingItems: any[] = [];
  let authError = null;

  try {
    const addons = await getInstalledAddons();

    const catalogEntries = addons.flatMap((addon) =>
      (addon.manifest.catalogs || []).map((catalog: StremioAddonCatalog) => ({
        addonTransportUrl: addon.transportUrl,
        addonName: addon.manifest.name,
        catalogId: catalog.id,
        catalogType: catalog.type,
        catalogName: catalog.name?.trim() || null,
      }))
    );

    const catalogPromises = catalogEntries.map(async (entry) => {
      const items = await fetchCatalogItems(
        entry.catalogType,
        entry.catalogId,
        entry.addonTransportUrl
      );

      const typeLabel = formatTypeLabel(entry.catalogType);
      const catalogLabel = formatCatalogLabel(entry.catalogName, entry.catalogId);
      const sectionName =
        catalogLabel.toLowerCase() === typeLabel.toLowerCase()
          ? typeLabel
          : `${catalogLabel} • ${typeLabel}`;

      return {
        sectionName,
        items: items.slice(0, 12),
      };
    });

    const [resolvedCatalogs, resolvedContinueWatching] = await Promise.all([
      Promise.all(catalogPromises),
      fetchResumeItems(),
    ]);

    catalogSections = resolvedCatalogs;
    continueWatchingItems = resolvedContinueWatching.slice(0, 20);
  } catch (error) {
    if ((error as any).isAuthError) {
      authError = error;
    } else {
      console.error("Failed to load data:", error);
    }
  }

  const continueWatchingBackdrop =
    continueWatchingItems[0]?.background || continueWatchingItems[0]?.poster;

  return (
    <AuthErrorHandler error={authError}>
      <div className="relative px-4 py-6 max-w-full overflow-hidden">
        <VibrantAuroraBackground
          backdropUrl={continueWatchingBackdrop}
          amplitude={0.5}
          className="fixed inset-0 z-0 pointer-events-none opacity-40"
        />

        <div className="relative z-[9999] mb-8">
          <div className="mb-6">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </div>

        <MediaSection
          sectionName="Continue Watching"
          mediaItems={continueWatchingItems}
          continueWatching
        />

        {catalogSections.map(({ sectionName, items }) =>
          items.length > 0 ? (
            <MediaSection
              key={sectionName}
              sectionName={sectionName}
              mediaItems={items}
            />
          ) : null
        )}
      </div>
    </AuthErrorHandler>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeLoadingContent />}>
      <HomeContent />
    </Suspense>
  );
}
