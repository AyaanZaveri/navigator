"use client";

import { useCallback, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./artwork-image.module.css";

type Props = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  src?: string;
  fallbackText?: string;
};

/** Keep the native image geometry and progressive rendering. Its own opaque
 * background is the skeleton, so no wrapper, decode wait, or reveal delay is needed. */
export function ArtworkImage({
  src, srcSet, sizes, alt = "", className, style, width, height,
  onLoad, onError, decoding = "async", fallbackText = "Image unavailable", ...props
}: Props) {
  const key = JSON.stringify([src, srcSet, sizes]);
  const [result, setResult] = useState<{ key: string; state: "ready" | "error" } | null>(null);
  const state = !src ? "error" : result?.key === key ? result.state : "loading";

  const attach = useCallback((image: HTMLImageElement | null) => {
    // A cached image can finish before hydration attaches load/error handlers.
    if (image?.complete && src) {
      setResult({ key, state: image.naturalWidth > 0 ? "ready" : "error" });
    }
  }, [key, src]);

  if (state === "error") {
    return <span role="img" aria-label={alt ? `${alt}: ${fallbackText}` : fallbackText}
      aria-hidden={props["aria-hidden"] ?? (alt ? undefined : true)}
      data-artwork-state="error"
      className={cn(className, styles.fallback)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined, ...style }}>
      <span aria-hidden="true">{fallbackText}</span>
    </span>;
  }

  return <img {...props} ref={attach} src={src} srcSet={srcSet} sizes={sizes}
    alt={alt} width={width} height={height} style={style} decoding={decoding}
    data-artwork-state={state}
    className={cn(className, state === "loading" && styles.pending)}
    onLoad={event => {
      setResult({ key, state: "ready" });
      onLoad?.(event);
    }}
    onError={event => {
      setResult({ key, state: "error" });
      onError?.(event);
    }} />;
}
