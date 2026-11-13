"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { scheduleRoutePrefetch } from "@/lib/route-prefetch";

/** Collections warm a full destination only after deliberate hover/focus,
 * instead of starting every dynamic title route as it enters the viewport. */
export function IntentLink({ href, onPointerEnter, onPointerLeave, onFocus, onBlur, ...props }:
    Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string }) {
    const [armed, setArmed] = useState<string | null>(null);
    const cancel = useRef<(() => void) | null>(null);
    useEffect(() => () => { cancel.current?.(); }, [href]);
    const start = () => {
        cancel.current?.();
        cancel.current = scheduleRoutePrefetch(href, () => setArmed(href));
    };
    const stop = () => { cancel.current?.(); cancel.current = null; setArmed(null); };
    return <Link {...props} draggable={false} href={href} prefetch={armed === href}
        onPointerEnter={event => { onPointerEnter?.(event); if (event.pointerType === "mouse") start(); }}
        onPointerLeave={event => { onPointerLeave?.(event); if (!event.currentTarget.matches(":focus-visible")) stop(); }}
        onFocus={event => { onFocus?.(event); if (event.currentTarget.matches(":focus-visible")) start(); }}
        onBlur={event => { onBlur?.(event); stop(); }} />;
}
