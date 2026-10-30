export const motionTokens = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, menuOpen: 0.28, menuClose: 0.2, considered: 0.48 },
  ease: {
    /** Responsive menu entrances and exits; starts promptly and settles gently. */
    out: [0.23, 1, 0.32, 1],
    /** Floating mobile sheets; follows the iOS drawer profile. */
    drawer: [0.32, 0.72, 0, 1],
    enter: [0.16, 1, 0.3, 1],
    exit: [0.7, 0, 0.84, 0],
    standard: [0.22, 1, 0.36, 1],
    /** For elements that move while already on screen. */
    inOut: [0.65, 0, 0.35, 1],
  },
  spring: {
    responsive: { type: "spring", stiffness: 520, damping: 44 },
    gentle: { type: "spring", stiffness: 340, damping: 34 },
    /** Presses, toggles, thumbs, and small indicators. Settles fast and never overshoots, so nothing jitters. */
    snappy: { type: "spring", visualDuration: 0.26, bounce: 0 },
    /** Panels, height changes, and layout shifts. Critically damped, never overshoots. */
    smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
    /** Shape morphs, shared layout highlights, and width changes that follow new content. No bounce: sizes and positions settle without overshoot. */
    morph: { type: "spring", visualDuration: 0.42, bounce: 0 },
  },
  /** Stagger steps in seconds. Keep total stagger under roughly 0.4s. */
  stagger: { char: 0.016, word: 0.04, line: 0.08, item: 0.035 },
  /** Blur radii in px for text and content crossfades. Keep blur small and brief. */
  blur: { subtle: 2, soft: 4, text: 8 },
} as const;
