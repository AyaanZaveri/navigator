# 001 — Animate confirmed addon removal

- **Status**: IMPLEMENTED — browser visual/focus verification pending
- **Commit**: dc49162
- **Severity**: LOW
- **Category**: Missed opportunities / spatial consistency
- **Estimated scope**: 3 existing component/style files; optionally 1 local motion helper

## Problem

After a successful uninstall, `components/addon-actions.tsx:54–58` closes the confirmation and immediately notifies the list:

```tsx
const result = await uninstallAddon(addon.id);
if (result.error) { setRemoveError(result.error); return; }
toast.success(`${addon.name} uninstalled`);
setRemoveOpen(false);
onUninstalled();
```

`components/addons-list.tsx:88–90` immediately removes that row:

```tsx
<AddonActions addon={addon} onUninstalled={() => {
    setRemoved((previous) => new Set(previous).add(addon.id));
}} />
```

The row disappears and subsequent rows jump. This rare action benefits from a short spatial bridge. Search results, filters, page loading, and ordinary list updates do not need motion. This finding is based on source inspection; its visual benefit still needs a browser feel check.

## Target

Animate only a successful uninstall whose final confirmation was activated with a pointer. Capture input origin at confirmation time, before awaiting the network request. Keyboard activation (`click.detail === 0`) remains instant, regardless of how the dialog was originally opened.

Normal motion, all starting in the same layout commit:

- Removed row: `opacity: 1 → 0`, `transform: scale(1) → scale(0.98)`, **160ms**, `cubic-bezier(0.23, 1, 0.32, 1)`.
- Remaining visible rows: FLIP translation from their previous visual rectangle to their new rectangle, ending at `transform: translate(0px, 0px)`, **240ms**, the same curve. Animate transforms only, never height, margin, top, or grid tracks.
- Exit and survivor movement run concurrently, completing within **240ms**, rather than adding 160ms and 240ms sequentially.
- No entrance stagger, bounce, blur animation, or extra success celebration.

With `(prefers-reduced-motion: reduce)`, fade the removed row's visual only over **120ms**, with the same curve; remaining rows settle immediately. With keyboard activation, make all changes immediately without adding motion. Successful server state, live announcements, focus restoration, and interaction availability must never wait for an animation.

For the last installed row, remove the logical row immediately, show the existing empty state and focus its heading. The outgoing visual may fade, but must not delay or obscure the empty state's interaction. Do not introduce an empty-state entrance animation.

## Repo conventions to follow

- Motion values already exist in `components/arc/motion-tokens.ts`: `duration.fast = 0.16`, `duration.standard = 0.24`, `duration.instant = 0.12`, `ease.out = [0.23, 1, 0.32, 1]`.
- CSS equivalents live in `components/arc/foundation.css`: `--duration-fast: 160ms`, `--duration-standard: 240ms`, `--duration-instant: 120ms`, `--ease-out: cubic-bezier(.23,1,.32,1)`.
- `components/media-card.tsx:86` distinguishes pointer activation using `e.detail > 0`.
- `components/addons-list.tsx:27–31` restores focus to search or the empty-state heading after removal. Preserve that behavior and verify Radix close autofocus does not override it.
- `components/addons-list.module.css` owns list/row presentation. Rows use container-responsive grids and backdrop blur; preserve their appearance.

## Steps

1. In `components/addon-actions.tsx`, extend the local `onUninstalled` callback contract to carry `{ animate: boolean }`. In the final confirmation button's existing `onClick`, capture `event.detail > 0` and pass that boolean through `remove()` to the success callback. Continue preventing the dialog's default close until success. Failed requests must never call the callback or trigger list motion. Do not infer input origin after the async request resolves.

2. In `components/addons-list.tsx`, add stable element refs keyed by addon ID and a one-shot removal transaction. Immediately before setting `removed`, record bounding rectangles of the currently rendered rows. Only do this for an eligible successful removal; do not install persistent layout animation on every row or use an effect keyed to `results` for every update.

3. Implement the transaction using native `Element.animate()` (WAAPI). This avoids new dependencies and permits explicit full `transform` strings. Capture the outgoing row as an inert visual clone outside normal flow before React removes the real row. Keep this clone within a component-owned, pointer-transparent overlay positioned relative to the list region. Strip IDs, set `aria-hidden="true"` and `inert`, and ensure it cannot receive focus or interaction. Never duplicate portal contents or move the real interactive row into the overlay. Freeze the visual's measured width, height, and resolved grid columns so its responsive layout does not change after cloning. Static positioning/dimensions may be assigned once; animate only opacity and transform.

4. Commit the successful removal immediately. In a layout effect for that transaction, measure surviving rows and animate each nonzero positional delta using full strings:

   ```ts
   // oldRect/newRect are measured for this same addon ID.
   const dx = oldRect.left - newRect.left;
   const dy = oldRect.top - newRect.top;
   element.animate([
     { transform: `translate(${dx}px, ${dy}px)` },
     { transform: "translate(0px, 0px)" },
   ], { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
   ```

   In the same pre-paint phase, animate the outgoing visual:

   ```ts
   visual.animate([
     { opacity: 1, transform: "scale(1)" },
     { opacity: 0, transform: "scale(0.98)" },
   ], { duration: 160, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" });
   ```

   Branch for reduced motion as specified above. Remove the visual and cancel/release animation handles after completion or cancellation. Handle rejected `finished` promises on cancellation. No opacity animation belongs on surviving rows.

5. Preserve focus restoration independently of animation completion. On successful uninstall, prevent confirmation-close autofocus from targeting the removed trigger if necessary; let the list focus its existing search input or empty heading. On cancellation or request failure, preserve current dialog behavior. The visual clone must be absent from the accessibility tree immediately, and the live count must reflect logical removal immediately.

6. Cancel all active removal visuals and transforms on query/capability changes, component unmount, viewport resize, or list-region scroll. For another successful removal while motion is active, capture current visual rectangles before cancelling prior transforms, then retarget from those rectangles. Remove prior ghosts. This prevents jumps, stale overlays, and animations accidentally carrying into filtering. Use a transaction generation/token to keep stale async cleanup from removing newer visuals. If WAAPI is unavailable, fall back to the existing immediate update.

7. In `components/addons-list.module.css`, add only the static overlay positioning and inert visual styling required by these steps. Do not change card spacing, layout breakpoints, blur values, or filter presentation. A local helper under `components/` is allowed if it makes cleanup and measurements easier to reason about; keep it specific to this list.

## Boundaries

- Do not implement watch-toggle or connection-feedback suggestions in this plan.
- Do not change uninstall APIs, protected-addon behavior, confirmation wording, toast behavior, or persisted state.
- Do not animate searching, filtering, initial mounting, server refreshes, or keyboard activation.
- Do not add dependencies, generic animation infrastructure, or permanent `will-change` layers.
- Do not start a dev server, run builds, automate a browser, uninstall a real account's addon for testing, commit, or publish without the relevant user authorization. Use the user's existing server for an authorized visual check and a disposable fixture for destructive flows.
- Preserve unrelated edits in `.gitignore` and `scripts/test-deployment-http.mjs`, and any newer concurrent edits.
- Re-read affected files before execution. If their behavior has drifted materially from commit dc49162, report the difference before changing the plan's assumptions.

## Verification

Implementation uses `components/addon-removal-motion.ts` with a fixed inert visual overlay and resolved style snapshots; no CSS edits or dependencies were needed. Automated transaction checks live in `scripts/test-addon-removal-motion.cjs`. TypeScript and addon checks passed. Browser visual/focus checks below remain pending; no browser automation or build was run.

- **Mechanical**: run `node scripts/test-addons.cjs`; expect both capability/filter and management checks to pass. Run `npx tsc --noEmit --incremental false`; expect no TypeScript errors attributable to the change. These checks do not verify visual motion.
- **Behavior**: using a disposable addon fixture and mocked uninstall response, check pointer success, keyboard success, failed request, dialog cancellation, middle/last-row removal, removing the last currently filtered result, and two successes in quick succession. Logical removal and live counts must happen immediately on success; failure/cancel must leave the row present.
- **Focus**: after success, focus must remain on the search input or final empty heading after the Radix close lifecycle finishes. Check at least immediately, after the next frame, and after 300ms. Ghosts must be inert, have no duplicate IDs, and be absent from accessibility navigation.
- **Feel check**: with authorized browser access on the existing server, observe a middle-row removal at normal speed and then 10% playback. The outgoing row should recede subtly while survivors move into their final positions concurrently; no blank-gap pause, content stretch, or stagger. Check narrow and wide layouts and a scrolled list.
- **Reduced motion**: emulate reduce; only a 120ms outgoing opacity fade remains. Confirm keyboard activation stays fully instant in both preferences.
- **Interruption**: filter, resize, scroll, navigate away, or remove another fixture while motion runs. No lingering clone, inline transform, unhandled rejection, or duplicate callback is acceptable.
- **Done when**: only confirmed pointer removals gain motion, the 240ms maximum total is respected, existing behavior/checks pass, and an actual visual check has been completed or explicitly reported as pending. Do not claim visual success from code checks alone.
