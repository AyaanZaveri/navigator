import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./search-page.module.css";

export function SearchSectionLoading({ addonName }: { addonName?: string }) {
    return (
        <div role="status" aria-label={addonName ? `Searching ${addonName}` : "Searching media"}>
            <span className="sr-only">{addonName ? `Searching ${addonName}…` : "Searching media…"}</span>
            <LoadingPlaceholder className={styles.results}>
                <div className={styles.toolbar}><Skeleton className="h-11 w-72 max-w-full rounded-[var(--radius-control)]" /></div>
                <div className={styles.grid}>
                    {Array.from({ length: 12 }, (_, index) => (
                        <div key={index} className="min-w-0">
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
