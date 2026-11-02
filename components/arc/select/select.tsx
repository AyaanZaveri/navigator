"use client";

import { forwardRef, useId, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  badge?: string;
  description?: string;
}

export interface SelectProps extends Omit<ComponentPropsWithoutRef<typeof SelectPrimitive.Root>, "children"> {
  "aria-describedby"?: string;
  "aria-busy"?: boolean;
  label: string;
  hideLabel?: boolean;
  description?: string;
  placeholder?: string;
  id?: string;
  className?: string;
  options: SelectOption[];
  portalContainer?: ComponentPropsWithoutRef<typeof SelectPrimitive.Portal>["container"];
  contentClassName?: string;
  triggerContent?: ReactNode;
  showChevron?: boolean;
  side?: ComponentPropsWithoutRef<typeof SelectPrimitive.Content>["side"];
  sideOffset?: number;
}

/** The shown value rolls in the direction of the list: a later option rises from below, an earlier one drops from above. */
const valueRoll: Variants = {
    enter: (direction: number) => ({ opacity: 0, y: `${direction * 0.35}em`, filter: `blur(${motionTokens.blur.soft}px)` }),
    center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } },
    exit: (direction: number) => ({ opacity: 0, y: `${direction * -0.3}em`, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }),
};
/** Reduced motion keeps a short crossfade; the resting state matches valueRoll so server and client markup agree. */
const valueFade: Variants = { enter: { opacity: 0 }, center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.instant } }, exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } } };

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
    { "aria-describedby": describedBy, "aria-busy": busy, label, hideLabel = false, description, placeholder = "Select an option", options, id, className, disabled, onValueChange,
        portalContainer, contentClassName, triggerContent, showChevron = true, side, sideOffset = 4, ...rootProps },
    ref,
) {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    const hintId = description ? `${controlId}-description` : undefined;
    const reduceMotion = useReducedMotion();
    const [uncontrolledValue, setUncontrolledValue] = useState(rootProps.defaultValue ?? "");
    const currentValue = rootProps.value ?? uncontrolledValue;
    const index = options.findIndex((option) => option.value === currentValue);
    const shown = currentValue ? options[index]?.label ?? "" : placeholder;
    const [previousIndex, setPreviousIndex] = useState(index);
    const [direction, setDirection] = useState(1);
    if (previousIndex !== index) { setPreviousIndex(index); setDirection(index > previousIndex ? 1 : -1); }

    return (
        <div className={styles.field}>
            <label htmlFor={controlId} className={hideLabel ? styles.srOnly : undefined}>{label}</label>
            <SelectPrimitive.Root {...rootProps} disabled={disabled} onValueChange={(next) => { setUncontrolledValue(next); onValueChange?.(next); }}>
                <SelectPrimitive.Trigger
                    ref={ref}
                    id={controlId}
                    data-icon-trigger={triggerContent != null ? "" : undefined}
                    aria-describedby={[hintId, describedBy].filter(Boolean).join(" ") || undefined}
                    aria-busy={busy}
                    className={[styles.trigger, className].filter(Boolean).join(" ")}
                >
                    {/* Radix keeps the real value for assistive tech; the visible copy below animates between values. */}
                    <span className={styles.srOnly}><SelectPrimitive.Value placeholder={placeholder} /></span>
                    {triggerContent ?? <>
                        {options[index]?.icon && <span className={styles.optionIcon} aria-hidden="true">{options[index].icon}</span>}
                        <span className={styles.valueCopy} aria-hidden="true">
                            <span className={styles.optionHeading}>
                                <span className={styles.valueText}>
                                    <AnimatePresence initial={false} custom={direction}>
                                        <motion.span key={currentValue ? `value-${currentValue}` : "placeholder"} data-placeholder={currentValue ? undefined : ""} custom={direction} variants={reduceMotion ? valueFade : valueRoll} initial="enter" animate="center" exit="exit">{shown}</motion.span>
                                    </AnimatePresence>
                                </span>
                                {options[index]?.badge && <Badge variant="outline" className={styles.badge}>{options[index].badge}</Badge>}
                            </span>
                            {options[index]?.description && <span className={styles.selectedDescription} title={options[index].description}>{options[index].description}</span>}
                        </span>
                    </>}
                    {showChevron && <SelectPrimitive.Icon className={styles.chevron}>
                        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                    </SelectPrimitive.Icon>}
                </SelectPrimitive.Trigger>
                <SelectPrimitive.Portal container={portalContainer}>
                    <SelectPrimitive.Content className={[styles.content, contentClassName].filter(Boolean).join(" ")} position="popper" side={side} sideOffset={sideOffset} collisionPadding={12}>
                        <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>
                            <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
                        </SelectPrimitive.ScrollUpButton>
                        <SelectPrimitive.Viewport className={styles.viewport}>
                            {options.map((option, optionIndex) => (
                                <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className={styles.item}
                                    textValue={option.label} aria-describedby={option.description ? `${controlId}-option-${optionIndex}` : undefined}>
                                    {option.icon && <span className={styles.optionIcon} aria-hidden="true">{option.icon}</span>}
                                    <span className={styles.optionCopy}>
                                        <span className={styles.optionHeading}>
                                            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                                            {option.badge && <Badge variant="outline" className={styles.badge} aria-hidden="true">{option.badge}</Badge>}
                                        </span>
                                        {option.description && <span id={`${controlId}-option-${optionIndex}`} className={styles.optionDescription} title={option.description}>{option.description}</span>}
                                    </span>
                                    <SelectPrimitive.ItemIndicator className={styles.indicator}>
                                        <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                                    </SelectPrimitive.ItemIndicator>
                                </SelectPrimitive.Item>
                            ))}
                        </SelectPrimitive.Viewport>
                        <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>
                            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                        </SelectPrimitive.ScrollDownButton>
                    </SelectPrimitive.Content>
                </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
            {description && <span id={hintId} className={styles.hint}>{description}</span>}
        </div>
    );
});
