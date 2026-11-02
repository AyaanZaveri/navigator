import type { ReactNode } from "react";
import { JotaiProvider } from "@/components/jotai-provider";
import { FullscreenDetector } from "@/components/fullscreen-detector";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LayoutContent } from "@/components/layout-content";

import { getUser } from "@/app/actions";

export default async function MainLayout({
    children,
}: {
  children: ReactNode;
}) {
    const user = await getUser();

    return (
        <JotaiProvider>
            <FullscreenDetector />
            <KeyboardShortcuts />
            <LayoutContent email={user?.email ?? ""} userId={user?._id ?? ""}>{children}</LayoutContent>
        </JotaiProvider>
    );
}
