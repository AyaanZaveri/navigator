"use client";

import { useId, type ComponentProps } from "react";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import styles from "./dropdown-menu.module.css";

// UIArc's dropdown pattern, extended with composable submenus/radio choices.
// https://uiarc.dev/components/dropdown-menu
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuLabel = Primitive.Label;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;
export const DropdownMenuSub = Primitive.Sub;

type Container = ComponentProps<typeof Primitive.Portal>["container"];

export function DropdownMenuContent({ container, className, sideOffset = 6, ...props }:
  ComponentProps<typeof Primitive.Content> & { container?: Container }) {
  return <Primitive.Portal container={container}>
    <Primitive.Content loop collisionPadding={12} sideOffset={sideOffset}
      {...props} className={cn(styles.menu, className)} />
  </Primitive.Portal>;
}

export function DropdownMenuSubTrigger({ children, className, ...props }: ComponentProps<typeof Primitive.SubTrigger>) {
  return <Primitive.SubTrigger {...props} className={cn(styles.item, styles.subTrigger, className)}>
    {children}<ChevronRight className={styles.chevron} size={15} aria-hidden="true" />
  </Primitive.SubTrigger>;
}

export function DropdownMenuSubContent({ container, className, sideOffset = 6, ...props }:
  ComponentProps<typeof Primitive.SubContent> & { container?: Container }) {
  return <Primitive.Portal container={container}>
    <Primitive.SubContent loop collisionPadding={12} sideOffset={sideOffset}
      {...props} className={cn(styles.menu, className)} />
  </Primitive.Portal>;
}

export function DropdownMenuRadioItem({ children, badge, description, className, ...props }:
  ComponentProps<typeof Primitive.RadioItem> & { badge?: string; description?: string }) {
  const descriptionId = useId();
  return <Primitive.RadioItem {...props} aria-describedby={description ? descriptionId : undefined}
    className={cn(styles.item, styles.radio, className)}>
    <span className={styles.copy}>
      <span className={styles.heading}>{children}
        {badge && <Badge variant="outline" className={styles.badge} aria-hidden="true">{badge}</Badge>}
      </span>
      {description && <span id={descriptionId} className={styles.description} title={description}>{description}</span>}
    </span>
    <Primitive.ItemIndicator className={styles.indicator}><Check size={16} aria-hidden="true" /></Primitive.ItemIndicator>
  </Primitive.RadioItem>;
}

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export function DropdownMenuOptions({ value, options, onValueChange } : {
  value: string;
  options: DropdownOption[];
  onValueChange(_value: string): void;
}) {
  return <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
    {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}
      textValue={option.label} disabled={option.disabled} description={option.description} badge={option.badge}>
      {option.label}
    </DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
}
