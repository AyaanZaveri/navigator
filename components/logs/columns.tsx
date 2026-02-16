"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface LogEntry {
  Name: string;
  Size: number;
  DateCreated: string;
  DateModified: string;
}

export const logColumns: ColumnDef<LogEntry>[] = [
  {
    accessorKey: "Name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Log Name
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const name = row.getValue("Name") as string;
      return (
        <div className="flex items-center gap-2 ml-2">
          <span className="font-medium">{name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "Size",
    header: ({ column }) => {
      return (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            Size
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const size = row.getValue("Size") as number;
      const formatted = formatFileSize(size);
      return <div className="text-center font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "DateCreated",
    header: ({ column }) => {
      return (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            Created
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("DateCreated") as string);
      return <div className="text-sm">{date.toLocaleString()}</div>;
    },
  },
  {
    accessorKey: "DateModified",
    header: ({ column }) => {
      return (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            Modified
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("DateModified") as string);
      return <div className="text-sm">{date.toLocaleString()}</div>;
    },
  },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
