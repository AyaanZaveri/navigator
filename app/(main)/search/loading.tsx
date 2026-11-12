import { SearchSectionLoading } from "@/components/search-section-loading";
import styles from "@/components/search-page.module.css";

export default function SearchLoading() {
    return (
        <div className={styles.page}>
            <div className={styles.content}>
                <header className={styles.heading}><h1 className={styles.title}>Finding titles…</h1></header>
                <SearchSectionLoading />
            </div>
        </div>
    );
}
