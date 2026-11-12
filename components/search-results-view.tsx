"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { MediaCard } from "@/components/media-card";
import { HomeInitialPalette } from "@/components/home-palette-provider";
import { mediaArtwork } from "@/lib/artwork";
import { SearchTypeFilters } from "@/components/search-page-controls";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { searchMediaFilter, searchPageUrl, type SearchResultSet } from "@/lib/search-presentation";
import styles from "./search-page.module.css";

const identity = (item: { type: string; id: string }) => `${item.type}:${item.id}`;

export function SearchResultsView({ query, initialPage, pageSets }: {
    query: string; initialPage: number; pageSets: SearchResultSet[];
}) {
    const params = useSearchParams();
    const filter = searchMediaFilter(params.get("type") ?? undefined);
    const requestedPage = Number(params.get("page") || 1);
    // Keep the current view while a pagination request is in flight. Segment
    // changes always use the already loaded first-page sets and never fetch.
    const set = pageSets.find(candidate => candidate.page === requestedPage)
        ?? pageSets.find(candidate => candidate.page === initialPage)!;
    const source = set[filter];
    const firstResult = source.results[0];
    const firstArtwork = firstResult ? mediaArtwork(firstResult.id, firstResult.type) : undefined;
    const page = set.page;
    const totalPages = Math.min(500, source.totalPages);
    const total = filter === "all" ? set.movie.totalResults + set.series.totalResults : source.totalResults;
    const pool = useMemo(() => {
        const cards = new Map<string, SearchResultSet["all"]["results"][number]>();
        for (const batch of pageSets) for (const kind of ["all", "movie", "series"] as const) {
            for (const item of batch[kind].results) if (!cards.has(identity(item))) cards.set(identity(item), item);
        }
        return cards;
    }, [pageSets]);
    const visible = new Set(source.results.map(identity));
    // Reorder stable keys into TMDB's order; hide other cards instead of
    // unmounting them, retaining decoded images and failed-source state.
    const ordered = [...source.results.map(identity), ...Array.from(pool.keys()).filter(key => !visible.has(key))];
    const url = (next: number) => searchPageUrl(query, filter, next);
    const changeType = (next: string) => {
        const selected = searchMediaFilter(next);
        if (selected === filter) return;
        window.history.pushState(null, "", searchPageUrl(query, selected));
    };

    return <div className={styles.results}>
        <HomeInitialPalette
            primary={firstResult?.poster || firstArtwork?.poster}
            fallback={firstResult?.background || firstArtwork?.background}
            resetInteraction
        />
        <div className={styles.toolbar}>
            <SearchTypeFilters value={filter} movies={set.movie.totalResults} shows={set.series.totalResults} onValueChange={changeType} />
        </div>
        <ul aria-label="Search results" className={styles.grid} hidden={!source.results.length}>
            {ordered.map(key => {
                const item = pool.get(key)!;
                return <li key={key} hidden={!visible.has(key)}>
                    <MediaCard item={item} fullWidth titleLines={2} revealArtwork={false}
                        subtitleContent={<>{item.year ? `${item.year} · ` : ""}{item.type === "movie" ? "Movie" : "TV Series"}</>} />
                </li>;
            })}
        </ul>
        {!source.results.length && <Empty className={styles.empty}>
            <EmptyHeader>
                <EmptyMedia variant="icon"><SearchIcon aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>{total > 0 ? "No results on this page" : "No matching titles"}</EmptyTitle>
                <EmptyDescription>{total > 0 ? "Choose another result type or return to the first page." : "Try another title or a different spelling in the search above."}</EmptyDescription>
            </EmptyHeader>
            <div className={styles.emptyActions}>
                {page > 1 && <Button asChild variant="secondary"><Link href={url(1)}>First page</Link></Button>}
                {filter !== "all" && <Button variant="outline" onClick={() => changeType("all")}>Show all types</Button>}
                <Button asChild variant="outline"><Link href="/">Browse titles</Link></Button>
            </div>
        </Empty>}
        {(page > 1 || page < totalPages) && <nav aria-label="Search result pages" className={styles.pagination}>
            <span className={styles.summary}>Page {page.toLocaleString("en-US")}{totalPages ? ` of ${totalPages.toLocaleString("en-US")}` : ""}</span>
            <div className={styles.pageActions}>
                {page > 1 && <Button asChild variant="secondary" size="sm"><Link href={url(page - 1)}>Previous</Link></Button>}
                {page < totalPages && <Button asChild variant="secondary" size="sm"><Link href={url(page + 1)}>Next</Link></Button>}
            </div>
        </nav>}
    </div>;
}
