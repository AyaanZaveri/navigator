import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { JotaiProvider } from "@/components/jotai-provider";
import { FullscreenDetector } from "@/components/fullscreen-detector";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LayoutContent } from "@/components/layout-content";
import { WatchHistoryProvider } from "@/contexts/watch-history-context";

import { getUser } from "@/app/actions";

export default async function MainLayout({
    children,
}: {
  children: ReactNode;
}) {
    const user = await getUser();
    if (!user) redirect("/login");

    return (
        <JotaiProvider>
            <FullscreenDetector />
            <KeyboardShortcuts />
            <WatchHistoryProvider key={user?._id ?? "anonymous"}>
                <LayoutContent email={user?.email ?? ""} userId={user?._id ?? ""}>{children}</LayoutContent>
            </WatchHistoryProvider>
        </JotaiProvider>
    );
}
