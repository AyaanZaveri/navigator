"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowUpRight, ExternalLink, Link2, Loader2, Plus, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { installAddon, previewAddon } from "@/app/actions/addons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/account-ui/dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ADDON_CAPABILITIES } from "@/lib/addons";
import { useStreamQueries } from "@/components/stream-query-provider";
import surface from "@/components/account-ui/surface.module.css";
import browseLink from "./browse-addon-link.module.css";

type Preview = NonNullable<Awaited<ReturnType<typeof previewAddon>>["addon"]>;

function isManifestLink(value: string) {
    try {
        const url = new URL(value.trim().replace(/^stremio:\/\//iu, "https://"));
        return ["http:", "https:"].includes(url.protocol) && /\/manifest\.json$/u.test(url.pathname);
    } catch { return false; }
}

export function AddAddonDialog() {
    const router = useRouter();
    const queries = useStreamQueries();
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const request = useRef(0);
    const submitting = useRef(false);
    const [open, setOpen] = useState(false);
    const [link, setLink] = useState("");
    const [preview, setPreview] = useState<Preview | null>(null);
    const [configureUrl, setConfigureUrl] = useState<string | null>(null);
    const [configurationRequired, setConfigurationRequired] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [lookupPending, setLookupPending] = useState(false);

    const review = useCallback(async (value: string, currentRequest: number) => {
        try {
            const result = await previewAddon(value);
            if (request.current !== currentRequest) return;
            if (result.error) { setError(result.error); return; }
            setPreview(result.addon);
            setConfigureUrl(result.configureUrl);
            setConfigurationRequired(result.configurationRequired);
        } catch {
            if (request.current === currentRequest) setError("Could not load this addon. Please try again.");
        }
    }, []);

    useEffect(() => {
        setLookupPending(false);
        if (!open || !isManifestLink(link)) return;
        const currentRequest = ++request.current;
        const timer = setTimeout(() => {
            if (request.current !== currentRequest || submitting.current) return;
            setLookupPending(true);
            void review(link, currentRequest).finally(() => {
                if (request.current === currentRequest) setLookupPending(false);
            });
        }, 600);
        return () => {
            clearTimeout(timer);
            if (request.current === currentRequest) request.current++;
        };
    }, [link, open, review]);

    function changeOpen(value: boolean) {
        setOpen(value);
        if (!value) {
            request.current++;
            setLink("");
            setPreview(null);
            setConfigureUrl(null);
            setConfigurationRequired(false);
            setError(null);
            setLookupPending(false);
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting.current || lookupPending || !link.trim() || configurationRequired) return;
        submitting.current = true;
        const currentRequest = ++request.current;
        setError(null);
        startTransition(async () => {
            try {
                if (preview) {
                    const result = await installAddon(link, preview.id);
                    if (result.error) {
                        if (request.current === currentRequest) setError(result.error);
                        return;
                    }
                    queries?.invalidate();
                    toast.success(`${preview.name} installed`);
                    changeOpen(false);
                    router.refresh();
                } else {
                    await review(link, currentRequest);
                }
            } catch {
                if (request.current === currentRequest) setError("Could not add this addon. Please try again.");
            } finally {
                submitting.current = false;
            }
        });
    }

    return (
        <>
            <Button ref={trigger} size="sm" className="rounded-full" disabled={pending} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined} onClick={() => changeOpen(true)}>
                <Plus data-icon="inline-start" aria-hidden="true" />Add addon
            </Button>
            <Dialog open={open} onOpenChange={changeOpen}>
                <DialogContent id={`${id}-dialog`} className={`${surface.surface} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain gap-6 p-6 sm:max-w-[480px]`} finalFocus={trigger}>
                    <DialogHeader className="pr-8">
                        <DialogTitle>Add addon</DialogTitle>
                        <DialogDescription className="sr-only">Install an addon from its Stremio link.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="flex min-w-0 flex-col gap-5" aria-busy={pending || lookupPending}>
                        <FieldGroup>
                            <Field data-invalid={!!error}>
                                <FieldLabel htmlFor={`${id}-link`} className="sr-only">Addon link</FieldLabel>
                                <InputGroup data-disabled={pending}>
                                    <InputGroupInput id={`${id}-link`} type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
                                        placeholder="https://example.com/manifest.json" required maxLength={8192} value={link} disabled={pending}
                                        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
                                        onChange={event => {
                                            request.current++;
                                            setLookupPending(false);
                                            setLink(event.target.value);
                                            setPreview(null);
                                            setConfigurationRequired(false);
                                            setConfigureUrl(null);
                                            setError(null);
                                        }} />
                                    <InputGroupAddon align="inline-start" aria-hidden="true">
                                        {lookupPending || (pending && !preview) ? (
                                            <Loader2 className="animate-spin motion-reduce:animate-none" />
                                        ) : preview ? (
                                            <Avatar key={preview.logo || preview.id} className="size-4 rounded-sm">
                                                {preview.logo && <AvatarImage src={preview.logo} alt="" referrerPolicy="no-referrer" className="object-contain" />}
                                                <AvatarFallback className="rounded-sm"><Puzzle className="size-4" /></AvatarFallback>
                                            </Avatar>
                                        ) : <Link2 />}
                                    </InputGroupAddon>
                                </InputGroup>
                                {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
                            </Field>
                        </FieldGroup>
                        {preview && (
                            <section aria-label="Addon preview" className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" aria-live="polite">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Avatar className="size-11 shrink-0 rounded-lg">
                                        {preview.logo && <AvatarImage src={preview.logo} alt="" className="object-contain" />}
                                        <AvatarFallback className="rounded-lg">{Array.from(preview.name)[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <h2 className="break-words font-medium">{preview.name}</h2>
                                        <p className="break-words text-xs text-muted-foreground">Version {preview.version}</p>
                                    </div>
                                </div>
                                {preview.description && <p className="break-words text-sm text-muted-foreground">{preview.description}</p>}
                                <div className="flex flex-wrap gap-1.5">
                                    {ADDON_CAPABILITIES.filter(item => preview.capabilities.includes(item.value)).map(item => (
                                        <Badge key={item.value} variant="secondary">{item.label}</Badge>
                                    ))}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {configurationRequired ? "Configure this addon first, then paste its configured link here." : "This installs the addon on your Stremio account and synced devices."}
                                </p>
                            </section>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <Button asChild variant="outline" size="sm">
                                <a draggable={false} className={browseLink.link} href="https://stremio-addons.net/" target="_blank" rel="noopener noreferrer" aria-label="Browse Stremio Addons (opens in a new tab)">
                                    <Image src="/images/stremio-addons.ico" width={16} height={16} unoptimized alt="" data-icon="inline-start" />
                                    <span className="inline-flex items-center">
                                        Browse addons
                                        <span className={browseLink.arrow} aria-hidden="true">
                                            <ArrowUpRight className="size-4" strokeWidth={2} absoluteStrokeWidth />
                                        </span>
                                    </span>
                                </a>
                            </Button>
                            <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => changeOpen(false)}>Cancel</Button>
                                {configurationRequired && configureUrl ? (
                                    <Button asChild size="sm">
                                        <a draggable={false} href={configureUrl} target="_blank" rel="noopener noreferrer">Configure addon<ExternalLink data-icon="inline-end" aria-hidden="true" /></a>
                                    </Button>
                                ) : (
                                    <Button type="submit" size="sm" disabled={pending || lookupPending || !link.trim() || configurationRequired}>
                                        {pending && <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                                        {pending ? (preview ? "Installing…" : "Loading…") : lookupPending ? "Loading…" : (preview ? "Install addon" : "Review addon")}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
