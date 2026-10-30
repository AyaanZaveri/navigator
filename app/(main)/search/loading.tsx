import { Skeleton } from "@/components/ui/skeleton";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";

function AddonSectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="flex flex-row flex-wrap gap-8">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={`search-loading-card-${index}`}
            className="h-[320px] w-[210px] rounded-xl"
          />
        ))}
      </div>
    </div>
  );
}

export default function SearchLoading() {
  return (
    <div className="relative px-[var(--page-gutter)] py-6 max-w-full">
      <VibrantAuroraBackground amplitude={0.8} blend={0.4} />

      <section className="relative z-10 mb-12 space-y-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <AddonSectionSkeleton key={`search-addon-loading-${index}`} />
        ))}
      </section>
    </div>
  );
}
