import { Skeleton } from "@/components/ui/skeleton";

export function MediaDetailsLoading() {
    return (
        <div role="status" aria-label="Loading media details" className="min-h-screen overflow-hidden pb-8 md:pr-1">
            <span className="sr-only">Loading media details…</span>
            <Skeleton className="h-[46vh] w-full md:mt-2.5 md:h-[62vh] md:rounded-xl" />
            <div className="relative mx-4 -mt-54 rounded-2xl bg-background p-6">
                <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
                    <Skeleton className="aspect-[2/3] w-40 shrink-0 rounded-lg md:w-56" />
                    <div className="flex w-full flex-col gap-5 md:pt-12">
                        <Skeleton className="h-12 w-3/4" />
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-20 w-full max-w-3xl" />
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
        <div role="status" aria-label="Loading episode" className="flex flex-col gap-8 p-6 md:flex-row md:pt-16">
            <span className="sr-only">Loading episode…</span>
            <Skeleton className="aspect-video w-full shrink-0 rounded-lg md:w-[22rem] lg:w-[24rem]" />
            <div className="flex w-full flex-col gap-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-20 w-full" />
            </div>
        </div>
    );
}
