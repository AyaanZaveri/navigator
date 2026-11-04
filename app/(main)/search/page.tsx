import { getAuthData } from "@/lib/server/auth";
import { searchTMDBMedia } from "@/lib/tmdb-discovery";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { MediaCard } from "@/components/media-card";
import { SearchSectionLoading } from "@/components/search-section-loading";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";

function first(value: string | string[] | undefined) {
    return (Array.isArray(value) ? value[0] : value)?.trim() || "";
}

async function SearchResults({ query, page }: { query: string; page: number }) {
    let results: Awaited<ReturnType<typeof searchTMDBMedia>>[] | undefined;
    let failure = "TMDB search is unavailable. Please try again.";
    try {
        await getAuthData();
        results = await Promise.all([
            searchTMDBMedia(query, undefined, "movie", page),
            searchTMDBMedia(query, undefined, "series", page),
        ]);
    } catch (error) {
        if (error instanceof Error && error.message) failure = error.message;
    }
    if (!results) return <p role="alert" className="py-8 text-center text-muted-foreground">{failure}</p>;
    const [movies, shows] = results;
    const totalPages = Math.min(500, Math.max(movies.totalPages, shows.totalPages));
    const url = (next: number) => `/search?${new URLSearchParams({ q: query, page: String(next) })}`;
    return (
        <div className="flex flex-col gap-12">
            {[{ title: "Movies", data: movies }, { title: "TV shows", data: shows }].map(({ title, data }) => data.results.length > 0 && (
                <section key={title} aria-label={title}>
                    <h2 className="mb-1 text-2xl font-semibold text-foreground font-poppins">{title}</h2>
                    <p className="mb-3 text-sm text-muted-foreground">{data.totalResults} results</p>
                    <div className="flex flex-wrap gap-8">
                        {data.results.map(item => <MediaCard key={item.id} item={item} />)}
                    </div>
                </section>
            ))}
            {!movies.results.length && !shows.results.length && (
                <p className="py-8 text-center text-muted-foreground">No movies or TV shows found. Try another title.</p>
            )}
            {(page > 1 || page < totalPages) && (
                <nav aria-label="Search result pages" className="flex items-center justify-center gap-6 text-sm">
                    {page > 1 && <Link href={url(page - 1)} className="underline underline-offset-4">Previous</Link>}
                    <span>Page {page}{totalPages ? ` of ${totalPages}` : ""}</span>
                    {page < totalPages && <Link href={url(page + 1)} className="underline underline-offset-4">Next</Link>}
                </nav>
            )}
        </div>
    );

}

export default async function Search({ searchParams }: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const query = first(params.q);
    const number = Number(first(params.page));
    const page = Number.isSafeInteger(number) && number > 0 ? Math.min(500, number) : 1;
    return (
        <div className="relative px-[var(--page-gutter)] py-6 max-w-full">
            <VibrantAuroraBackground amplitude={0.8} blend={0.4} />
            <section className="relative z-10 mb-12">
                {query.length > 300 ? <p role="alert">Enter up to 300 characters.</p> : query ? (
                    <Suspense key={`${query}:${page}`} fallback={<SearchSectionLoading />}>
                        <SearchResults query={query} page={page} />
                    </Suspense>
                ) : (
                    <div className="p-8 text-center">
                        <SearchIcon className="mx-auto mb-4 size-12 text-muted-foreground" />
                        <p className="text-muted-foreground">Start typing to search.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
