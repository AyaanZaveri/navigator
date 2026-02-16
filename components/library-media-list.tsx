"use client";

import React, { useState, useMemo } from "react";
import { MediaCard } from "@/components/media-card";
import type { MediaItem } from "@/types/stremio";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  Search,
  Type,
  Dice6,
  Star,
  Calendar,
  ArrowUp,
  ArrowDown,
  Dices,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SortField = {
  value: string;
  label: string;
  getSortValue: (item: MediaItem) => number | string;
};

type SortOrder = "asc" | "desc";

const getSortFieldIcon = (fieldValue: string) => {
  const iconMap: Record<string, any> = {
    name: Type,
    random: Dice6,
    rating: Star,
    year: Calendar,
  };
  return iconMap[fieldValue] || Type;
};

const sortFields: SortField[] = [
  {
    value: "name",
    label: "Name",
    getSortValue: (item) => item.name || "",
  },
  {
    value: "random",
    label: "Random",
    getSortValue: () => Math.random(),
  },
  {
    value: "rating",
    label: "Rating",
    getSortValue: (item) =>
      item.imdbRating ? parseFloat(item.imdbRating) : 0,
  },
  {
    value: "year",
    label: "Year",
    getSortValue: (item) => item.year || 0,
  },
];

interface LibraryMediaListProps {
  mediaItems: MediaItem[];
}

export function LibraryMediaList({ mediaItems }: LibraryMediaListProps) {
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [rerollTrigger, setRerollTrigger] = useState<number>(0);

  const handleReroll = () => setRerollTrigger((prev) => prev + 1);

  const filteredAndSortedItems = useMemo(() => {
    const filtered = mediaItems.filter((item) =>
      (item.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedField = sortFields.find(
      (field) => field.value === sortField
    );
    if (!selectedField) return filtered;

    return [...filtered].sort((a, b) => {
      if (sortField === "random") return Math.random() - 0.5;

      const valueA = selectedField.getSortValue(a);
      const valueB = selectedField.getSortValue(b);

      let comparison = 0;
      if (typeof valueA === "string" && typeof valueB === "string") {
        comparison = valueA.localeCompare(valueB);
      } else {
        comparison = (valueA as number) - (valueB as number);
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [mediaItems, sortField, sortOrder, searchQuery, rerollTrigger]);

  const selectedFieldLabel =
    sortFields.find((f) => f.value === sortField)?.label || "Name";
  const SelectedFieldIcon = getSortFieldIcon(sortField);
  const SelectedOrderIcon = sortOrder === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SelectedFieldIcon className="h-4 w-4" />
                Sort: {selectedFieldLabel}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {sortFields.map((field) => {
                const FieldIcon = getSortFieldIcon(field.value);
                return (
                  <DropdownMenuItem
                    key={field.value}
                    onClick={() => setSortField(field.value)}
                    className={`gap-2 ${
                      sortField === field.value ? "bg-accent" : ""
                    }`}
                  >
                    <FieldIcon className="h-4 w-4" />
                    {field.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {sortField !== "random" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                setSortOrder(sortOrder === "asc" ? "desc" : "asc")
              }
            >
              <SelectedOrderIcon className="h-4 w-4" />
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </Button>
          )}

          {sortField === "random" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReroll}
                    className="gap-2"
                  >
                    <Dices className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reroll</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 auto-rows-max">
        {filteredAndSortedItems.map((item) => (
          <MediaCard key={item.id} item={item} fullWidth />
        ))}
      </div>

      {filteredAndSortedItems.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="text-muted-foreground text-lg mb-2">
              {searchQuery
                ? "No matching items found"
                : "No items found"}
            </div>
            <div className="text-muted-foreground text-sm">
              {searchQuery
                ? `No media items match "${searchQuery}".`
                : "This library appears to be empty."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
