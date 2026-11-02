"use client";

import { useContext, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRuntime } from "@/lib/format-runtime";
import styles from "./result-card.module.css";
import { ResultCardEntranceContext } from "./result-card-motion";

export function ResultBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="h-5 max-w-full px-1.5 py-0 text-xs font-medium [&_svg]:size-3"
    >
      {children}
    </Badge>
  );
}

export function ResultMeta({ children }: { children: ReactNode }) {
  return <span className={styles.meta}>{children}</span>;
}

export function ResultCard({
  title,
  subtitle,
  icon: Icon,
  image,
  imageAspect = "portrait",
  metadata,
  description,
  error,
  children,
  href,
  onClick,
  className,
  index = 0,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon: LucideIcon;
  image?: string | null;
  imageAspect?: "portrait" | "landscape";
  metadata?: ReactNode;
  description?: ReactNode;
  error?: string;
  children?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  index?: number;
}) {
  const reduceMotion = useReducedMotion();
  const animateEntrance = useContext(ResultCardEntranceContext);
  const closeNavigator = useSetAtom(isAIAskOpenAtom);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const interactive = !!(href || onClick);
  const Copy = onClick && !href ? "span" : "div";
  const Body = onClick && !href ? "span" : "div";
  const rowClass = cn(styles.row, imageAspect === "landscape" && styles.landscape, interactive && styles.interactive, className);
  const content = (
    <>
      {image && image !== failedImage ? (
        <img
          draggable={false}
          src={image}
          alt=""
          aria-hidden="true"
          className={styles.image}
          data-aspect={imageAspect}
          onError={() => setFailedImage(image)}
        />
      ) : (
        <span className={styles.icon} aria-hidden="true">
          <Icon className="size-4" />
        </span>
      )}
      <Copy className={styles.copy}>
        <span className={styles.title}>
          <span className={styles.titleText}>{title}</span>
          {interactive && (
            <ArrowRight aria-hidden="true" className={styles.arrow} />
          )}
        </span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        {metadata && <span className={styles.metadata}>{metadata}</span>}
        {description && (
          <span className={styles.description}>{description}</span>
        )}
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
        {children && <Body className={styles.body}>{children}</Body>}
      </Copy>
    </>
  );
  const activate = () => {
    onClick?.();
    closeNavigator(false);
  };
  return (
    <motion.div
      animate={{ opacity: 1, transform: "translateY(0)" }}
      initial={animateEntrance ? {
        opacity: 0,
        transform: reduceMotion ? "none" : "translateY(10px)",
      } : false}
      transition={{
        delay: reduceMotion ? 0 : index * 0.05,
        duration: 0.18,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      {href ? (
        <Link
          href={href}
          prefetch={!href.startsWith("/api/navigator/title")}
          className={rowClass}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onClick={activate}
        >
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" className={rowClass} onClick={activate}>
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </motion.div>
  );
}

export function formatCardRuntime(minutes?: number) {
  if (!minutes) return null;
  return formatRuntime(minutes);
}
