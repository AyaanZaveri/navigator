import { Skeleton } from "@/components/ui/skeleton";

export function MediaDetailsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading media details"
      className="min-h-screen overflow-hidden pb-8"
    >
      <span className="sr-only">Loading media details…</span>
      <Skeleton className="h-[46vh] w-full rounded-none md:h-[62vh]" />
      <div className="relative mx-4 -mt-54 rounded-2xl bg-background px-4 pt-6 pb-6 md:px-6 md:pt-8">
        <div className="@container">
          <div className="grid min-w-0 gap-6 @3xl:grid-cols-[14rem_minmax(0,1fr)] @3xl:items-start @3xl:gap-8">
            <Skeleton className="aspect-[2/3] w-40 max-w-full rounded-lg @3xl:w-full" />
            <div className="flex min-w-0 flex-col gap-6 @3xl:pt-3">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-6 w-40 max-w-full" />
              </div>
              <Skeleton className="h-24 w-full max-w-prose" />
              <Skeleton className="h-28 w-full max-w-prose" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// This boundary replaces only the selected episode, keeping the series
// backdrop, episode carousel, and its scroll position mounted.
export function EpisodeDetailsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading episode"
      className="@container pt-6 md:pt-8"
    >
      <span className="sr-only">Loading episode…</span>
      <div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] @4xl:items-start @4xl:gap-8">
        <Skeleton className="aspect-video w-full max-w-xl rounded-lg @4xl:max-w-none" />
        <div className="flex min-w-0 flex-col gap-6 @4xl:pt-3">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-32 max-w-full" />
          </div>
          <Skeleton className="h-20 w-full max-w-prose" />
        </div>
      </div>
    </div>
  );
}
