/** Addon previews can also arrive from a full metadata endpoint, ending mid-sentence. */
export function needsCompleteDescription(
  description: string | undefined,
): boolean {
  return !description?.trim() || /(?:\.{3}|…)\s*$/.test(description);
}

/** Preserve the chosen addon's artwork and fields; repair only an incomplete synopsis. */
export async function completeMediaDescription<
  T extends { description?: string },
>(
  selected: T,
  alternatives: ReadonlyArray<Promise<T>>,
  fallback?: () => Promise<string | undefined>,
): Promise<T> {
  if (!needsCompleteDescription(selected.description)) return selected;

  const requireComplete = (description: string | undefined): string => {
    if (needsCompleteDescription(description))
      throw new Error("Incomplete synopsis");
    return description!.trim();
  };
  const candidates = alternatives.map(async (candidate) =>
    requireComplete((await candidate).description),
  );
  if (fallback)
    candidates.push(Promise.resolve().then(fallback).then(requireComplete));
  const description = await Promise.any(candidates).catch(() => undefined);
  return description ? { ...selected, description } : selected;
}
