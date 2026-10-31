"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Settings2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getInstalledAddonLinks, uninstallAddon } from "@/app/actions/addons";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AddonListItem } from "@/lib/addons";
import styles from "./addons-list.module.css";

export function AddonActions({ addon, onUninstalled }: { addon: AddonListItem; onUninstalled: () => void }) {
    const [shareOpen, setShareOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);
    const [copying, setCopying] = useState(false);
    const cancel = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!shareOpen) return;
        let active = true;
        setShareError(null);
        setShareUrl(null);
        getInstalledAddonLinks(addon.id).then((result) => {
            if (!active) return;
            setShareUrl(result.shareUrl);
            setShareError(result.error);
        }).catch(() => {
            if (active) setShareError("Could not load the addon link. Close this dialog and try again.");
        });
        return () => { active = false; };
    }, [shareOpen, addon.id]);

    async function copyLink() {
        if (!shareUrl || copying) return;
        setCopying(true);
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast.success("Addon link copied");
        } catch {
            setShareError("Could not copy automatically. Select the link and copy it manually.");
        } finally { setCopying(false); }
    }

    async function remove() {
        if (removing) return;
        setRemoving(true);
        setRemoveError(null);
        try {
            const result = await uninstallAddon(addon.id);
            if (result.error) { setRemoveError(result.error); return; }
            toast.success(`${addon.name} uninstalled`);
            setRemoveOpen(false);
            onUninstalled();
        } catch {
            setRemoveError("Could not uninstall this addon. Please try again.");
        } finally { setRemoving(false); }
    }

    return (
        <div className={styles.actions}>
            {addon.configurable && (
                <Button asChild variant="outline" size="sm">
                    <a href={`/api/addons/${addon.id}/configure`} target="_blank" rel="noopener noreferrer" aria-label={`Settings for ${addon.name} (opens in a new tab)`}>
                        <Settings2 data-icon="inline-start" aria-hidden="true" />Settings
                    </a>
                </Button>
            )}
            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                <DialogTrigger asChild><Button variant="outline" size="sm" aria-label={`Share ${addon.name}`}><Share2 data-icon="inline-start" aria-hidden="true" />Share</Button></DialogTrigger>
                <DialogContent title={`Share ${addon.name}`} description="Copy the manifest link to install this addon in Stremio.">
                    <div className={styles.dialogBody}>
                        {shareUrl ? (
                            <>
                                <label htmlFor={`share-${addon.id}`} className="text-sm font-medium">Addon link</label>
                                <Input id={`share-${addon.id}`} value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                                {addon.configurable && <p className="text-sm text-muted-foreground">This configured link may include your personal addon settings. Share it only with people you trust.</p>}
                            </>
                        ) : !shareError && <p role="status">Loading addon link…</p>}
                        {shareError && <p role="alert" className={styles.error}>{shareError}</p>}
                        <div className={styles.dialogActions}>
                            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
                            <Button disabled={!shareUrl || copying} onClick={copyLink}><Copy data-icon="inline-start" aria-hidden="true" />{copying ? "Copying…" : "Copy link"}</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            {addon.protected ? <span className={styles.protected}>Protected addon</span> : (
                <Dialog open={removeOpen} onOpenChange={(open) => { if (!removing) { setRemoveOpen(open); setRemoveError(null); } }}>
                    <DialogTrigger asChild><Button variant="outline" size="sm" aria-label={`Uninstall ${addon.name}`}><Trash2 data-icon="inline-start" aria-hidden="true" />Uninstall</Button></DialogTrigger>
                    <DialogContent role="alertdialog" title={`Uninstall ${addon.name}?`} description="This removes this addon configuration from your Stremio account and all your synced devices. You can install it again later."
                        onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
                        onPointerDownOutside={(event) => event.preventDefault()}>
                        <div className={styles.dialogBody} aria-busy={removing}>
                            {removeError && <p role="alert" className={styles.error}>{removeError}</p>}
                            <div className={styles.dialogActions}>
                                <DialogClose asChild><Button ref={cancel} variant="outline" disabled={removing}>Cancel</Button></DialogClose>
                                <Button variant="destructive" disabled={removing} onClick={remove}>{removing ? "Uninstalling…" : "Uninstall addon"}</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
