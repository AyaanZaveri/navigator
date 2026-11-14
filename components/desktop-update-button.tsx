"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopBridge, type UpdateStatus } from "@/lib/desktop/bridge";

/** Keep updates reachable before sign-in as well as from Settings → About. */
export function DesktopUpdateButton() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    useEffect(() => {
        const bridge = desktopBridge();
        if (!bridge?.capabilities?.updates) return;
        const unsubscribe = bridge.subscribe(message => { if (message.type === "update-status") setStatus(message); });
        bridge.send({ type: "update-status" });
        return unsubscribe;
    }, []);
    if (!status?.available || status.state !== "available") return null;
    return <Button variant="outline" className="max-sm:size-11 max-sm:p-0"
        aria-label="Update available. Open the updater to download." title="Update available"
        onClick={() => desktopBridge()?.send({ type: "update-check" })}>
        <Download data-icon="inline-start" aria-hidden="true" />
        <span className="hidden sm:inline">Update available</span>
    </Button>;
}
