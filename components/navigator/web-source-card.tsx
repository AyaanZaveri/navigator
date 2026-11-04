"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { ResultCard, ResultMeta } from "./result-card";

export function WebSourceCard({ source, index = 0 }: {
  source: { url: string; title?: string };
  index?: number;
}) {
  const [failed, setFailed] = useState(false);
  let hostname: string;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:") return null;
    hostname = url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  return (
    <ResultCard
      title={source.title || hostname}
      iconContent={failed ? <Globe className="size-6 text-muted-foreground" /> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
          alt="" className="size-6 rounded-[6px] object-contain" onError={() => setFailed(true)} />
      )}
      href={source.url}
      external
      index={index}
      metadata={<ResultMeta>{hostname}</ResultMeta>}
    />
  );
}
