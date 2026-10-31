"use client";

import { Suspense, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Home, Puzzle, Settings } from "lucide-react";
import { logout } from "@/app/actions";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { SearchBar } from "@/components/search-component";
import { Button } from "@/components/ui/button";
import { UserMenu, type ThemePreference } from "@/components/arc/user-menu/user-menu";

const subscribe = () => () => {};

function ProfileMenu({ email }: { email: string }) {
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const mounted = useSyncExternalStore(subscribe, () => true, () => false);
    const preference: ThemePreference = mounted && (theme === "light" || theme === "dark") ? theme : "system";

    return (
        <UserMenu
            user={{ name: email.split("@")[0] || "User", email }}
            theme={preference}
            onThemeChange={setTheme}
            items={[
                { label: "Home", icon: <Home size={16} aria-hidden="true" />, onSelect: () => router.push("/") },
                { label: "Settings", icon: <Settings size={16} aria-hidden="true" />, onSelect: () => router.push("/settings") },
                { label: "Add-ons", icon: <Puzzle size={16} aria-hidden="true" />, onSelect: () => router.push("/addons") },
            ]}
            onSignOut={logout}
        />
    );
}

export function AppHeader({ email, overlay = false }: { email: string; overlay?: boolean }) {
    const { isPlayerVisible } = useMediaPlayer();
    if (isPlayerVisible) return null;

    return (
        <header className={`${overlay ? "absolute inset-x-0 top-0" : "relative"} z-50 shrink-0 pl-[max(var(--page-gutter),env(safe-area-inset-left))] pr-[max(var(--page-gutter),env(safe-area-inset-right))]`}>
            <nav aria-label="Main navigation" className="flex min-w-0 items-center gap-3 py-5">
                <Button asChild variant="ghost" size="icon" className="size-11 rounded-md p-0 transition-[filter,scale] hover:bg-transparent hover:brightness-90 dark:hover:bg-transparent">
                    <Link href="/" aria-label="Navigator home" draggable={false}>
                        <Image src="/logo/navigator-header-light.svg?v=3" alt="" width={32} height={32} draggable={false} className="size-8 dark:hidden" />
                        <Image src="/logo/navigator-header-dark.svg?v=2" alt="" width={32} height={32} draggable={false} className="hidden size-8 dark:block" />
                    </Link>
                </Button>
                <div className="min-w-0 flex-1 sm:max-w-xl">
                    <Suspense fallback={<div className="h-11 rounded-xl bg-muted" />}>
                        <SearchBar />
                    </Suspense>
                </div>
                <div className="ml-auto flex h-11 shrink-0 items-center justify-center"><ProfileMenu email={email} /></div>
            </nav>
        </header>
    );
}
