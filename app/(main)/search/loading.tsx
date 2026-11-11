import { SearchSectionLoading } from "@/components/search-section-loading";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { HomePaletteProvider } from "@/components/home-palette-provider";
import styles from "@/components/search-page.module.css";

export default function SearchLoading() {
    return (
        <HomePaletteProvider><div className={styles.page}>
            <HomeGradientBackground />
            <div className={styles.content}>
                <header className={styles.heading}><h1 className={styles.title}>Finding titles…</h1></header>
                <SearchSectionLoading />
            </div>
        </div></HomePaletteProvider>
    );
}
