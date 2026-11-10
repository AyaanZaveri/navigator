import type { ReactNode } from "react";
import { JotaiProvider } from "@/components/jotai-provider";
import { FullscreenDetector } from "@/components/fullscreen-detector";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LayoutContent } from "@/components/layout-content";
import { WatchHistoryProvider } from "@/contexts/watch-history-context";
import { AccountProvider } from "@/components/account-provider";

import { getUser } from "@/app/actions";

export default async function MainLayout({
    children,
}: {
  children: ReactNode;
}) {
    const user = await getUser();

    return (
        <JotaiProvider key={user?._id ?? "anonymous"}>
            <AccountProvider key={user?._id ?? "anonymous"} authenticated={Boolean(user)}>
                <FullscreenDetector />
                <KeyboardShortcuts />
                <WatchHistoryProvider key={user?._id ?? "anonymous"} enabled={Boolean(user)}>
                    <LayoutContent email={user?.email ?? ""} userId={user?._id ?? ""}>{children}</LayoutContent>
                </WatchHistoryProvider>
            </AccountProvider>
        </JotaiProvider>
    );
}
