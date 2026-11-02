import { SearchSectionLoading } from "@/components/search-section-loading";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";

export default function SearchLoading() {
  return (
    <div className="relative px-[var(--page-gutter)] py-6 max-w-full">
      <VibrantAuroraBackground amplitude={0.8} blend={0.4} />

      <section className="relative z-10 mb-12 space-y-12">
        {Array.from({ length: 2 }).map((_, index) => (
          <SearchSectionLoading key={`search-tmdb-loading-${index}`} />
        ))}
      </section>
    </div>
  );
}
