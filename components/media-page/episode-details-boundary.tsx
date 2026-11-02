"use client";

import type { ReactNode } from "react";
import { SkeletonSuspense, SkulletProvider } from "skullet/react";
import styles from "./episode-details-boundary.module.css";

// Route-scoped only: no persistent shape ID or global provider. Server-rendered
// children stay server components; only their loading/reveal boundary is client-side.
export function EpisodeDetailsBoundary({ children, sample }: { children: ReactNode; sample: ReactNode }) {
  return (
    <div className={styles.surface}>
      <SkulletProvider
        theme={{ animation: "pulse", speed: "slow", radius: "4px" }}
        reveal={{ order: "together", duration: 180, hold: 150 }}
      >
        <SkeletonSuspense skeleton={sample} label="Loading episode details">
          {children}
        </SkeletonSuspense>
      </SkulletProvider>
    </div>
  );
}
