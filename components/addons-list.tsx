"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddonActions } from "@/components/addon-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SearchField } from "@/components/arc/search-field/search-field";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { ADDON_CAPABILITIES, addonTypeLabel, filterAddons, type AddonListItem } from "@/lib/addons";
import styles from "./addons-list.module.css";

export function AddonsList({ addons }: { addons: AddonListItem[] }) {
    const [query, setQuery] = useState("");
    const [capability, setCapability] = useState("all");
    const [removed, setRemoved] = useState<Set<string>>(() => new Set());
    const search = useRef<HTMLInputElement>(null);
    const emptyTitle = useRef<HTMLDivElement>(null);
    const installed = useMemo(() => addons.filter((addon) => !removed.has(addon.id)), [addons, removed]);
    const results = useMemo(() => filterAddons(installed, query, capability), [installed, query, capability]);
    const filters = [
        { value: "all", label: "All" },
        ...ADDON_CAPABILITIES.filter((item) => installed.some((addon) => addon.capabilities.includes(item.value) || item.value === capability)),
    ];

    useEffect(() => {
        if (!removed.size) return;
        const frame = requestAnimationFrame(() => (search.current ?? emptyTitle.current)?.focus());
        return () => cancelAnimationFrame(frame);
    }, [removed]);

    if (!installed.length) {
        return (
            <Empty className={styles.empty}>
                <EmptyHeader>
                    <EmptyTitle ref={emptyTitle} tabIndex={-1}>No addons installed</EmptyTitle>
                    <EmptyDescription>Install addons in Stremio, then refresh this page to see them here.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <div className={styles.directory}>
            <div className={styles.toolbar}>
                <div className={styles.search}>
                    <SearchField ref={search} label="Search addons" hideLabel placeholder="Search addons…" value={query} onValueChange={setQuery} autoComplete="off" />
                </div>
                <ChipGroup label="Filter addons by capability" multiple={false} options={filters} value={[capability]} onValueChange={(values) => setCapability(values[0] ?? "all")} />
            </div>

            <p role="status" aria-live="polite" className={styles.resultCount}>
                {results.length === installed.length ? `${installed.length} installed` : `${results.length} of ${installed.length} addons`}
            </p>

            {results.length ? (
                <ul aria-label="Installed addons" className={styles.list}>
                    {results.map((addon) => (
                        <li key={addon.id} className={styles.row}>
                            <Avatar className={styles.logo}>
                                {addon.logo && <AvatarImage src={addon.logo} alt="" loading="lazy" className="object-contain" />}
                                <AvatarFallback className="rounded-xl text-sm font-medium">
                                    {addon.name.split(/\s+/u).slice(0, 2).map((word) => Array.from(word)[0]).join("")}
                                </AvatarFallback>
                            </Avatar>
                            <div className={styles.identity}>
                                <div className={styles.nameRow}>
                                    <h2 className={styles.name}>{addon.name}</h2>
                                    {addon.version && <span className={styles.version}>v{addon.version}</span>}
                                </div>
                                {addon.description && <p className={styles.description}>{addon.description}</p>}
                                {addon.types.length > 0 && <p className={styles.types}>{[...new Set(addon.types.map(addonTypeLabel))].filter(Boolean).join(" · ")}</p>}
                            </div>
                            <div className={styles.metadata}>
                                <div className={styles.capabilities}>
                                    {ADDON_CAPABILITIES.filter((item) => addon.capabilities.includes(item.value)).map((item) => (
                                        <Badge key={item.value} variant="secondary" className={styles.badge}>{item.label}</Badge>
                                    ))}
                                    {!ADDON_CAPABILITIES.some((item) => addon.capabilities.includes(item.value)) && <Badge variant="secondary" className={styles.badge}>Addon</Badge>}
                                </div>
                                {addon.catalogCount > 0 && <p className={styles.catalogCount}>{addon.catalogCount} catalog{addon.catalogCount === 1 ? "" : "s"}</p>}
                                <AddonActions addon={addon} onUninstalled={() => {
                                    setRemoved((previous) => new Set(previous).add(addon.id));
                                }} />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <Empty className={styles.empty}>
                    <EmptyHeader>
                        <EmptyTitle>No matching addons</EmptyTitle>
                        <EmptyDescription>Try another search or clear the filters to see all your addons.</EmptyDescription>
                    </EmptyHeader>
                    <Button variant="outline" onClick={() => { setQuery(""); setCapability("all"); }}>Clear filters</Button>
                </Empty>
            )}
        </div>
    );
}
