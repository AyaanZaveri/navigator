"use client";

import { useTheme } from "next-themes";
import { Palette } from "lucide-react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { cn } from "@/lib/utils";
import styles from "./theme-toggle-card.module.css";

interface ThemeToggleCardProps {
  className?: string;
}

export function ThemeToggleCard({
  className,
}: ThemeToggleCardProps) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={cn(styles.card, className)}>
      <div className={styles.label}>
        <Palette aria-hidden="true" size={14} strokeWidth={1.75} />
        <span>Theme settings</span>
      </div>
      <SegmentedControl
        className={styles.control}
        label="Theme"
        value={theme ?? "dark"}
        onValueChange={setTheme}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ]}
      />
    </div>
  );
}
