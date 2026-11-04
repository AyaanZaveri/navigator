"use client";

import { Ship } from "lucide-react";
import { Button } from "./focus-ui/button";
import { Kbd, KbdGroup } from "./focus-ui/kbd";
import "./launcher.css";

/** The launcher can render without the chat SDK, Markdown or motion runtime. */
export function NavigatorLauncher({ onClick, onIntent, busy = false, expanded = false }: {
    onClick: () => void;
    onIntent?: () => void;
    busy?: boolean;
    expanded?: boolean;
}) {
    return <Button
        data-navigator-launcher=""
        aria-expanded={expanded}
        aria-busy={busy || undefined}
        aria-keyshortcuts="Meta+K Control+K"
        className="h-9 rounded-full border border-border dark:border-white/12 dark:focus-visible:border-ring backdrop-blur-sm bg-popover/85 dark:bg-popover/75 px-3.5 shadow-xl shadow-primary/7 dark:shadow-primary/6 hover:bg-muted/75!"
        onClick={onClick} onPointerEnter={onIntent} onFocus={onIntent}
        type="button" variant="outline"
    >
        <Ship aria-hidden="true" className="size-4 stroke-[1.5] text-muted-foreground" />
        <span>Ask Navigator</span>
        <KbdGroup className="ml-1 hidden sm:inline-flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
    </Button>;
}
