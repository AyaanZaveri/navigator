// UI Arc, free MIT component: https://uiarc.dev/components/popover
"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./popover.module.css";

export const Popover = PopoverPrimitive.Root;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverAnchor = PopoverPrimitive.Anchor;

/** The trigger anchors the panel, so it opts out of press-scale: a scaled rect measured on open would shift the panel as the trigger springs back. */
export const PopoverTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(function PopoverTrigger({ className, ...props }, ref) {
  return <PopoverPrimitive.Trigger {...props} ref={ref} className={[styles.anchor, className].filter(Boolean).join(" ")}/>;
});

PopoverTrigger.displayName = "PopoverTrigger";

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { container?: ComponentPropsWithoutRef<typeof PopoverPrimitive.Portal>["container"] }
>(function PopoverContent({ container, className, align = "start", sideOffset = 6, collisionPadding = 10, ...props }, ref) {
  return <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content
      {...props}
      data-slot="popover-content"
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={[styles.content, className].filter(Boolean).join(" ")}
    />
  </PopoverPrimitive.Portal>;
});

PopoverContent.displayName = "PopoverContent";
