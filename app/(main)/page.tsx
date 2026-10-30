import { fetchCatalogItems, fetchResumeItems } from "@/app/actions/media";
import { getInstalledAddons } from "@/app/actions/auth";
import { AuthErrorHandler } from "@/app/components/auth-error-handler";
import { HomeCatalogSectionsLazy } from "@/components/home-catalog-sections-lazy";
import { MediaSection } from "@/components/media-section";
import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import type { HomeCatalogEntry, HomeCatalogSection } from "@/lib/home-catalogs";
import { CATALOG_BATCH_SIZE, INITIAL_CATALOG_COUNT } from "@/lib/home-catalogs";
import type { MediaItem, StremioAddonCatalog } from "@/types/stremio";
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

function ContinueWatchingCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-80">
      <Skeleton className="w-full aspect-video rounded-md" />
      <div className="px-1 mt-2.5 space-y-1.5">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

function PosterCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-36">
      <Skeleton className="w-full aspect-[2/3] rounded-md" />
      <div className="px-1 mt-2.5 space-y-1.5">
        <Skeleton className="h-4 w-11/12 rounded" />
        <Skeleton className="h-3 w-2/5 rounded" />
      </div>
    </div>
  );
}

function HomeSectionSkeleton({
  continueWatching = false,
}: {
  continueWatching?: boolean;
}) {
  const skeletonCount = continueWatching ? 8 : 16;

  return (
    <LoadingPlaceholder className="relative z-10 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Skeleton className="h-8 w-56 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="hidden md:block h-9 w-9 rounded-md" />
          <Skeleton className="hidden md:block h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: skeletonCount }).map((_, index) =>
          continueWatching ? (
            <ContinueWatchingCardSkeleton key={`cw-card-skeleton-${index}`} />
          ) : (
            <PosterCardSkeleton key={`poster-card-skeleton-${index}`} />
          )
        )}
      </div>
    </LoadingPlaceholder>
  );
}

function HomeCatalogsFallback() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <HomeSectionSkeleton
          key={`home-catalog-loading-${index}`}
        />
      ))}
    </>
  );
}

async function ContinueWatchingSection({
  continueWatchingPromise,
}: {
  continueWatchingPromise: Promise<MediaItem[]>;
}) {
  const continueWatchingItems = (await continueWatchingPromise).slice(0, 20);

  return (
    <MediaSection
      sectionName="Continue Watching"
      mediaItems={continueWatchingItems}
      continueWatching
    />
  );
}

async function buildCatalogEntries(): Promise<HomeCatalogEntry[]> {
  const addons = await getInstalledAddons();

  const catalogEntries = addons.flatMap((addon) =>
    (addon.manifest.catalogs || []).map((catalog: StremioAddonCatalog) => ({
      addonTransportUrl: addon.transportUrl,
      catalogId: catalog.id,
      catalogType: catalog.type,
      catalogName: catalog.name?.trim() || null,
    }))
  );

  return catalogEntries.map((entry, index) => {
    const typeLabel = formatTypeLabel(entry.catalogType);
    const catalogLabel = formatCatalogLabel(entry.catalogName, entry.catalogId);
    const sectionName =
      catalogLabel.toLowerCase() === typeLabel.toLowerCase()
        ? typeLabel
        : `${catalogLabel} • ${typeLabel}`;

    return {
      key: `${entry.addonTransportUrl}-${entry.catalogType}-${entry.catalogId}-${index}`,
      sectionName,
      catalogType: entry.catalogType,
      catalogId: entry.catalogId,
      addonTransportUrl: entry.addonTransportUrl,
    };
  });
}

async function loadCatalogSections(entries: HomeCatalogEntry[]): Promise<HomeCatalogSection[]> {
  const loadedSections = await Promise.all(
    entries.map(async (entry) => {
      const mediaItems = (
        await fetchCatalogItems(entry.catalogType, entry.catalogId, entry.addonTransportUrl)
      ).slice(0, 12);

      if (mediaItems.length === 0) return null;

      return {
        key: entry.key,
        sectionName: entry.sectionName,
        mediaItems,
      } satisfies HomeCatalogSection;
    })
  );

  return loadedSections.filter(
    (section): section is HomeCatalogSection => section !== null
  );
}

async function CatalogSectionsBootstrap({
  catalogEntriesPromise,
}: {
  catalogEntriesPromise: Promise<HomeCatalogEntry[]>;
}) {
  const catalogEntries = await catalogEntriesPromise;
  if (catalogEntries.length === 0) return null;

  const initialEntries = catalogEntries.slice(0, INITIAL_CATALOG_COUNT);
  const remainingEntries = catalogEntries.slice(INITIAL_CATALOG_COUNT);
  const initialSections = await loadCatalogSections(initialEntries);

  return (
    <HomeCatalogSectionsLazy
      initialSections={initialSections}
      remainingEntries={remainingEntries}
      batchSize={CATALOG_BATCH_SIZE}
    />
  );
}

export default function Home() {
  const continueWatchingPromise = fetchResumeItems();
  const catalogEntriesPromise = buildCatalogEntries();

  return (
    <AuthErrorHandler>
      <div className="relative px-[var(--page-gutter)] pt-3 pb-8 max-w-full overflow-hidden">
        <HomeGradientBackground />

        <Suspense fallback={<HomeSectionSkeleton continueWatching />}>
          <ContinueWatchingSection continueWatchingPromise={continueWatchingPromise} />
        </Suspense>

        <Suspense fallback={<HomeCatalogsFallback />}>
          <CatalogSectionsBootstrap catalogEntriesPromise={catalogEntriesPromise} />
        </Suspense>
      </div>
    </AuthErrorHandler>
  );
}
