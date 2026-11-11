"use client";

import { useCallback, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./artwork-image.module.css";

type Props = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  src?: string;
  fallbackText?: string;
};

/** Keep native image geometry; reveal loaded pixels over the card's surface. */
export function ArtworkImage({
  src, srcSet, sizes, alt = "", className, style, width, height,
  onLoad, onError, decoding = "async", fallbackText = "Image unavailable", ...props
}: Props) {
  const key = JSON.stringify([src, srcSet, sizes]);
  const [result, setResult] = useState<{ key: string; state: "ready" | "error"; unseen?: boolean } | null>(null);
  const state = !src ? "error" : result?.key === key ? result.state : "loading";

  const finish = useCallback((image: HTMLImageElement) => {
    const box = image.getBoundingClientRect?.();
    const unseen = !!box && (box.bottom <= 0 || box.right <= 0 || box.top >= window.innerHeight || box.left >= window.innerWidth);
    setResult({ key, state: "ready", unseen });
  }, [key]);

  const attach = useCallback((image: HTMLImageElement | null) => {
    // A cached image can finish before hydration attaches load/error handlers.
    if (image?.complete && src) {
      if (image.naturalWidth > 0) finish(image);
      else setResult({ key, state: "error" });
    }
  }, [key, src, finish]);

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
    className={cn(className, styles.image, state === "loading" && styles.pending,
      state === "ready" && !result?.unseen && styles.reveal)}
    onLoad={event => {
      finish(event.currentTarget);
      onLoad?.(event);
    }}
    onError={event => {
      setResult({ key, state: "error" });
      onError?.(event);
    }} />;
}
