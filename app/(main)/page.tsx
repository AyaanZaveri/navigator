import { fetchCatalogItems, fetchResumeItems } from "@/app/actions/media";
import { getInstalledAddons } from "@/app/actions/auth";
import { AuthErrorHandler } from "@/app/components/auth-error-handler";
import { MediaSection } from "@/components/media-section";
import { SearchBar } from "@/components/search-component";
import { Skeleton } from "@/components/ui/skeleton";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import type { MediaItem, StremioAddonCatalog } from "@/types/stremio";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type CatalogSectionWork = {
  key: string;
  sectionName: string;
  itemsPromise: Promise<MediaItem[]>;
};

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
    <section className="relative z-10 mb-5">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-56 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden pb-6">
        {Array.from({ length: skeletonCount }).map((_, index) =>
          continueWatching ? (
            <ContinueWatchingCardSkeleton key={`cw-card-skeleton-${index}`} />
          ) : (
            <PosterCardSkeleton key={`poster-card-skeleton-${index}`} />
          )
        )}
      </div>
    </section>
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

async function HomeBackground({
  continueWatchingPromise,
}: {
  continueWatchingPromise: Promise<MediaItem[]>;
}) {
  const continueWatchingItems = await continueWatchingPromise;
  const continueWatchingBackdrop =
    continueWatchingItems[0]?.background || continueWatchingItems[0]?.poster;

  return (
    <VibrantAuroraBackground
      backdropUrl={continueWatchingBackdrop}
      amplitude={0.5}
      className="fixed inset-0 z-0 pointer-events-none opacity-40"
    />
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

async function buildCatalogSectionWork(): Promise<CatalogSectionWork[]> {
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
      itemsPromise: fetchCatalogItems(
        entry.catalogType,
        entry.catalogId,
        entry.addonTransportUrl
      ).then((items) => items.slice(0, 12)),
    };
  });
}

async function CatalogSection({
  sectionName,
  itemsPromise,
  revealAfterPromise,
}: {
  sectionName: string;
  itemsPromise: Promise<MediaItem[]>;
  revealAfterPromise: Promise<void>;
}) {
  await revealAfterPromise;
  const items = await itemsPromise;
  if (items.length === 0) return null;
  return <MediaSection sectionName={sectionName} mediaItems={items} />;
}

async function CatalogSections({
  catalogSectionsPromise,
}: {
  catalogSectionsPromise: Promise<CatalogSectionWork[]>;
}) {
  const catalogSections = await catalogSectionsPromise;
  if (catalogSections.length === 0) return null;

  const revealAfterPromises: Promise<void>[] = [];
  for (let i = 0; i < catalogSections.length; i += 1) {
    if (i === 0) {
      revealAfterPromises.push(Promise.resolve());
      continue;
    }

    revealAfterPromises.push(
      Promise.all([
        revealAfterPromises[i - 1],
        catalogSections[i - 1].itemsPromise,
      ]).then(() => undefined)
    );
  }

  return (
    <>
      {catalogSections.map((section, index) => (
        <Suspense key={section.key} fallback={<HomeSectionSkeleton />}>
          <CatalogSection
            sectionName={section.sectionName}
            itemsPromise={section.itemsPromise}
            revealAfterPromise={revealAfterPromises[index]}
          />
        </Suspense>
      ))}
    </>
  );
}

export default function Home() {
  const continueWatchingPromise = fetchResumeItems();
  const catalogSectionsPromise = buildCatalogSectionWork();

  return (
    <AuthErrorHandler>
      <div className="relative px-4 py-6 max-w-full overflow-hidden">
        <Suspense
          fallback={
            <VibrantAuroraBackground
              amplitude={0.5}
              className="fixed inset-0 z-0 pointer-events-none opacity-40"
            />
          }
        >
          <HomeBackground continueWatchingPromise={continueWatchingPromise} />
        </Suspense>

        <div className="relative z-[9999] mb-8">
          <div className="mb-6">
            <Suspense fallback={null}>
              <SearchBar />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={<HomeSectionSkeleton continueWatching />}>
          <ContinueWatchingSection continueWatchingPromise={continueWatchingPromise} />
        </Suspense>

        <Suspense fallback={<HomeCatalogsFallback />}>
          <CatalogSections catalogSectionsPromise={catalogSectionsPromise} />
        </Suspense>
      </div>
    </AuthErrorHandler>
  );
}
