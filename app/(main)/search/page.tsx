import { searchTMDBMedia } from "@/lib/tmdb-discovery";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { HomePaletteProvider } from "@/components/home-palette-provider";
import { SearchResultsView } from "@/components/search-results-view";
import { SearchSectionLoading } from "@/components/search-section-loading";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SearchPageHeading, SearchRetryButton } from "@/components/search-page-controls";
import type { SearchResultSet } from "@/lib/search-presentation";
import styles from "@/components/search-page.module.css";

function first(value: string | string[] | undefined) {
    return (Array.isArray(value) ? value[0] : value)?.trim() || "";
}

async function SearchResults({ query, page }: { query: string; page: number }) {
    let pageSets: SearchResultSet[] | undefined;
    let failure = "TMDB search is unavailable. Please try again.";
    try {
        // Preload each native ranking once. First pages are also included for
        // direct links to later pages, so every segment can reset locally.
        pageSets = await Promise.all((page === 1 ? [1] : [1, page]).map(async number => {
            const [movie, series, all] = await Promise.all([
                searchTMDBMedia(query, undefined, "movie", number),
                searchTMDBMedia(query, undefined, "series", number),
                searchTMDBMedia(query, undefined, undefined, number),
            ]);
            return { page: number, movie, series, all };
        }));
    } catch (error) {
        if (error instanceof Error && error.message) failure = error.message;
    }
    if (!pageSets) return <Empty role="alert" className={styles.empty}>
        <EmptyHeader><EmptyTitle>Search couldn’t load</EmptyTitle><EmptyDescription>{failure}</EmptyDescription></EmptyHeader>
        <div className={styles.emptyActions}><SearchRetryButton /><Button asChild variant="outline"><Link href="/settings/connections">Connection settings</Link></Button></div>
    </Empty>;
    return <SearchResultsView key={query} query={query} initialPage={page} pageSets={pageSets} />;
}

export default async function Search({ searchParams }: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const query = first(params.q);
    const number = Number(first(params.page));
    const page = Number.isSafeInteger(number) && number > 0 ? Math.min(500, number) : 1;
    return (
        <HomePaletteProvider><div className={styles.page}>
            <HomeGradientBackground />
            <div className={styles.content}>
                <SearchPageHeading query={query.length > 300 ? "" : query} />
                {query.length > 300 ? <p role="alert">Enter up to 300 characters.</p> : query ? (
                    <Suspense key={query} fallback={<SearchSectionLoading />}>
                        <SearchResults query={query} page={page} />
                    </Suspense>
                ) : (
                    <Empty className={styles.empty}><EmptyHeader>
                        <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle>Search movies and TV shows</EmptyTitle>
                        <EmptyDescription>Enter a title in the search above, or browse for something new.</EmptyDescription>
                    </EmptyHeader><Button asChild variant="secondary"><Link href="/">Browse titles</Link></Button></Empty>
                )}
            </div>
        </div></HomePaletteProvider>
    );
}
