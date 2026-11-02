"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { isAIAskOpenAtom, isPlayerVisibleAtom } from "@/lib/atoms";
import { NavigatorLauncher } from "@/components/navigator/launcher";
import { preloadNavigator } from "@/lib/preload-tools";

const Player = dynamic(() => import("@/components/global-media-player").then(module => module.GlobalMediaPlayer), {
    ssr: false,
    loading: () => <div role="status" className="fixed inset-0 z-[1000] grid place-items-center bg-background text-foreground">Opening player…</div>,
});
function NavigatorPending() {
    const [open, setOpen] = useAtom(isAIAskOpenAtom);
    if (!open) return null;
    return <div role="status" data-navigator-focus-ui="" className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--layer-player-navigator)] flex justify-center px-4">
        <div className="pointer-events-auto mb-0 sm:mb-1"><NavigatorLauncher busy expanded onClick={() => setOpen(false)} /></div>
    </div>;
}
const Navigator = dynamic(() => import("@/components/navigator/ai-ask"), { ssr: false, loading: NavigatorPending });

export function DeferredTools({ userId, navigatorEnabled, onToggleAIAsk }: {
    userId: string;
    navigatorEnabled: boolean;
    onToggleAIAsk: () => void;
}) {
    const playing = useAtomValue(isPlayerVisibleAtom);
    const open = useAtomValue(isAIAskOpenAtom);
    const [playerRequested, setPlayerRequested] = useState(false);
    const [navigatorRequested, setNavigatorRequested] = useState(false);
    // These one-way latches preserve player cleanup and chat history after first
    // use. Conditional render-time state adjustment avoids an extra effect commit.
    if (playing && !playerRequested) setPlayerRequested(true);
    if (navigatorEnabled && open && !navigatorRequested) setNavigatorRequested(true);
    const showNavigator = navigatorEnabled && (navigatorRequested || open);
    return <>
        {navigatorEnabled && !playing && !showNavigator && <div data-navigator-focus-ui="" className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--layer-navigator)] flex justify-center px-4">
            <div className="pointer-events-auto mb-0 sm:mb-1"><NavigatorLauncher onClick={onToggleAIAsk} onIntent={preloadNavigator} /></div>
        </div>}
        {showNavigator && <Navigator key={userId} userId={userId} />}
        {(playerRequested || playing) && <Player onToggleAIAsk={navigatorEnabled ? onToggleAIAsk : undefined} />}
    </>;
}
