"use client";

import React from "react";
import type { StremioStream } from "@/types/stremio";
import { ScrollArea } from "./ui/scroll-area";

interface MediaInfoDialogProps {
  stream: StremioStream;
}

export function MediaInfoDialog({ stream }: MediaInfoDialogProps) {
  if (!stream) return null;

  return (
    <ScrollArea className="max-h-[70vh] pr-4">
      <div className="text-sm">
        <h2 className="text-lg font-semibold mb-4 font-poppins">
          Stream Info
        </h2>
        <section className="mb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {stream.name && (
              <>
                <dt className="font-semibold">Source</dt>
                <dd>{stream.name}</dd>
              </>
            )}
            {stream.title && (
              <>
                <dt className="font-semibold">Title</dt>
                <dd className="break-all">{stream.title}</dd>
              </>
            )}
            {stream.url && (
              <>
                <dt className="font-semibold">URL</dt>
                <dd className="break-all font-mono text-xs">
                  {stream.url}
                </dd>
              </>
            )}
            {stream.behaviorHints?.videoSize && (
              <>
                <dt className="font-semibold">Size</dt>
                <dd>
                  {(stream.behaviorHints.videoSize / 1024 ** 3).toFixed(2)}{" "}
                  GB
                </dd>
              </>
            )}
            {stream.behaviorHints?.filename && (
              <>
                <dt className="font-semibold">Filename</dt>
                <dd className="break-all font-mono text-xs">
                  {stream.behaviorHints.filename}
                </dd>
              </>
            )}
          </dl>
        </section>
      </div>
    </ScrollArea>
  );
}
