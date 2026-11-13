"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Settings, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getInstalledAddonLinks, uninstallAddon } from "@/app/actions/addons";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { AddonListItem } from "@/lib/addons";
import styles from "./addons-list.module.css";
import { useStreamQueries } from "@/components/stream-query-provider";

export function AddonActions({ addon, onUninstalled, onRemovalFocus }: { addon: AddonListItem; onUninstalled: (_options: { animate: boolean }) => void; onRemovalFocus: () => void }) {
    const queries = useStreamQueries();
    const configuring = useRef(false);
    useEffect(() => {
        const returned = () => { if (configuring.current) { configuring.current = false; queries?.invalidate(); } };
        window.addEventListener("focus", returned);
        return () => window.removeEventListener("focus", returned);
    }, [queries]);
    const uninstalled = useRef(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);
    const [copying, setCopying] = useState(false);

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

    async function remove(animate: boolean) {
        if (removing) return;
        setRemoving(true);
        setRemoveError(null);
        try {
            const result = await uninstallAddon(addon.id);
            if (result.error) { setRemoveError(result.error); return; }
            queries?.invalidate();
            toast.success(`${addon.name} uninstalled`);
            uninstalled.current = true;
            setRemoveOpen(false);
            onUninstalled({ animate });
        } catch {
            setRemoveError("Could not uninstall this addon. Please try again.");
        } finally { setRemoving(false); }
    }

    return (
        <div className={styles.actions}>
            <div className={styles.primaryActions}>
                {addon.configurable && (
                    <Button asChild variant="outline" size="sm">
                        <a draggable={false} href={`/api/addons/${addon.id}/configure`} onClick={() => { configuring.current = true; }} target="_blank" rel="noopener noreferrer" aria-label={`Settings for ${addon.name} (opens in a new tab)`}>
                            <Settings data-icon="inline-start" aria-hidden="true" />Settings
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
            </div>
            {!addon.protected && (
                <AlertDialog open={removeOpen} onOpenChange={(open) => { if (!removing) { setRemoveOpen(open); setRemoveError(null); } }}>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className={styles.removeAction} aria-label={`Uninstall ${addon.name}`}><Trash2 data-icon="inline-start" aria-hidden="true" />Uninstall</Button></AlertDialogTrigger>
                    <AlertDialogContent aria-busy={removing} onCloseAutoFocus={event => {
                        if (uninstalled.current) {
                            event.preventDefault();
                            onRemovalFocus();
                        }
                    }}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Uninstall {addon.name}?</AlertDialogTitle>
                            <AlertDialogDescription>This removes this addon configuration from your Stremio account and all your synced devices. You can install it again later.</AlertDialogDescription>
                        </AlertDialogHeader>
                        {removeError && <p role="alert" className={styles.error}>{removeError}</p>}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" disabled={removing} onClick={(event) => { event.preventDefault(); void remove(event.detail > 0); }}>
                                {removing ? (
                                    <>
                                        <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                                            Uninstalling
                                    </>
                                ) : "Uninstall addon"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}
