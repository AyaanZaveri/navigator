"use client";

import { useTheme } from "next-themes";
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResultCard } from "./result-card";

interface ThemeToggleCardProps {
  className?: string;
  index?: number;
}

export function ThemeToggleCard({
  className,
  index = 0,
}: ThemeToggleCardProps) {
  const { theme, setTheme } = useTheme();
  return (
    <ResultCard
      className={className}
      index={index}
      title="Theme settings"
      icon={Palette}
      description="Choose your preferred theme"
    >
      <Tabs value={theme} onValueChange={setTheme}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="light" className="gap-1 text-xs">
            <Sun className="size-3" />
            Light
          </TabsTrigger>
          <TabsTrigger value="dark" className="gap-1 text-xs">
            <Moon className="size-3" />
            Dark
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1 text-xs">
            <Monitor className="size-3" />
            System
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </ResultCard>
  );
}
