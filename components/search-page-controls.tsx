"use client";

import { useLayoutEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Button } from "@/components/ui/button";
import { type SearchMediaFilter } from "@/lib/search-presentation";
import styles from "./search-page.module.css";

export function SearchPageHeading({ query }: { query: string }) {
    const params = useSearchParams();
    const heading = useRef<HTMLHeadingElement>(null);
    // A filter is a local view change. Keep keyboard focus on its control.
    const key = `${query}:${params.get("page") || "1"}`;
    const filter = params.get("type") || "all";
    const previous = useRef({ key, query, filter });
    useLayoutEffect(() => {
        document.title = query ? `Search: ${query.slice(0, 100)} · Navigator` : "Search · Navigator";
        if (previous.current.key !== key && (previous.current.query !== query || previous.current.filter === filter)) {
            document.querySelector<HTMLElement>("[data-page-scroll]")?.scrollTo({ top: 0, behavior: "instant" });
            heading.current?.focus({ preventScroll: true });
        }
        previous.current = { key, query, filter };
    }, [key, query, filter]);
    return <header className={styles.heading}>
        <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {query ? <>Results for “{query}”</> : "Find your next watch"}
        </h1>
    </header>;
}

export function SearchTypeFilters({ value, movies, shows, onValueChange }: {
    value: SearchMediaFilter; movies: number; shows: number; onValueChange: (_value: string) => void;
}) {
    const badge = (count: number) => <span className={styles.badge}>{count.toLocaleString("en-US")}</span>;
    return <div className={styles.filters}>
        <SegmentedControl label="Result type" value={value} options={[
            { value: "all", label: "All", accessory: badge(movies + shows) },
            { value: "movie", label: "Movies", accessory: badge(movies) },
            { value: "series", label: "TV shows", accessory: badge(shows) },
        ]} onValueChange={onValueChange} />
    </div>;
}

export function SearchRetryButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {pending ? "Trying again…" : "Try again"}
    </Button>;
}
