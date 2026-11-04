"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/arc/select/select";
import { HomeGradientBackground } from "@/components/home-gradient-background";
import { SETTINGS_CATEGORIES, settingsCategoryFromPath } from "@/lib/settings-navigation";
import styles from "@/app/(main)/settings/settings.module.css";

export function SettingsShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const active = settingsCategoryFromPath(pathname);
    const category = SETTINGS_CATEGORIES.find(category => category.id === active)!;
    const titleRef = useRef<HTMLHeadingElement>(null);
    const previousPath = useRef(pathname);

    useEffect(() => {
        document.title = `${category.label} settings · Navigator`;
        if (previousPath.current !== pathname) {
            document.querySelector<HTMLElement>("[data-page-scroll]")?.scrollTo({ top: 0, behavior: "instant" });
            titleRef.current?.focus({ preventScroll: true });
        }
        previousPath.current = pathname;
    }, [pathname, category.label]);

    return <div className={styles.page}>
        <HomeGradientBackground />
        <div className={`${styles.content} ${styles.workspace}`}>
            <aside className={styles.sidebar}>
                <nav aria-label="Settings">
                    <ul className={styles.navigationList}>
                        {SETTINGS_CATEGORIES.map(item => <li key={item.id}>
                            <Link className={styles.navigationLink} href={`/settings/${item.id}`} aria-current={active === item.id ? "page" : undefined}>{item.label}</Link>
                        </li>)}
                    </ul>
                </nav>
            </aside>
            <div className={styles.mobileNavigation}>
                <Select id="settings-category" label="Settings" value={active}
                    onValueChange={category => router.push(`/settings/${category}`)}
                    options={SETTINGS_CATEGORIES.map(category => ({ value: category.id, label: category.label }))} />
            </div>
            <div className={styles.panel}>
                <header className={styles.pageHeader}>
                    <h1 ref={titleRef} tabIndex={-1} className={styles.pageTitle}>{category.label}</h1>
                </header>
                <div className={styles.sections}>{children}</div>
            </div>
        </div>
    </div>;
}
