"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopBridge, type UpdateStatus } from "@/lib/desktop/bridge";

/** Keep updates reachable before sign-in as well as from Settings → About. */
export function DesktopUpdateButton() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    useEffect(() => {
        const bridge = desktopBridge();
        if (bridge?.platform !== "windows" || !bridge.capabilities?.updates) return;
        const unsubscribe = bridge.subscribe(message => { if (message.type === "update-status") setStatus(message); });
        bridge.send({ type: "update-status" });
        return unsubscribe;
    }, []);
    if (!status?.available) return null;
    return <Button asChild variant="ghost" size="icon">
        <Link href="/settings/about" aria-label="App updates" title="App updates">
            <Download aria-hidden="true" />
        </Link>
    </Button>;
}
