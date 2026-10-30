import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Skeleton } from "@/components/ui/skeleton";

export function SearchSectionLoading({ addonName }: { addonName?: string }) {
  return (
    <div role="status" aria-label={addonName ? `Searching ${addonName}` : "Searching media"}>
      <span className="sr-only">{addonName ? `Searching ${addonName}…` : "Searching media…"}</span>
      <LoadingPlaceholder>
        <Skeleton className="mb-1 h-8 w-72 max-w-full" />
        <Skeleton className="mb-3 h-5 w-40 max-w-full" />
        <div className="flex flex-wrap gap-8">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="w-36 shrink-0">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <div className="px-1">
                <Skeleton className="mt-2.5 h-5 w-11/12" />
                <Skeleton className="mt-0.5 h-4 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </LoadingPlaceholder>
    </div>
  );
}
