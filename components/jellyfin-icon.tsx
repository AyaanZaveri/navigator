import React from "react";

interface StreamIconProps {
  className?: string;
}

/** Generic streaming / play icon. */
export function StreamIcon({ className = "h-4 w-4" }: StreamIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
