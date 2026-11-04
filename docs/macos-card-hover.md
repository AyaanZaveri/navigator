# macOS card hover investigation — 2026-11-04

## Finding

The Continue Watching brightness flash reproduces in the installed macOS app
when only the hover CSS is cycled. Pointer handlers, route prefetching, palette
selection, and player preloading are not necessary to trigger it.

Frame-by-frame captures show the resting shade briefly disappearing during the
artwork transform transition. The image is normally dimmed by a separate 35%
black `frame::before` plane. Ordinary posters do not have that plane, explaining
why they do not show this particular brightness change. The precise internal
WebKit layer failure is inferred from the rendering experiments, not established
by an upstream WebKit bug diagnosis.

## Experiments

1. Rendered actual card markup and CSS in an isolated, transparent WKWebView.
   Compared the baseline against disabled Play blur, progress blur, zoom, paint
   containment, and logo shadow. The initial SVG fixture did not reproduce the
   user's failure, so it was not used to validate a fix.
2. Added real React components, the home WebGL background, palette scene, and
   adaptive header-logo sampler. Investigated frame gaps separately from the
   brightness failure. Failed pointer-delivery attempts were excluded.
3. Inspected the installed app through its existing `--devtools` option. Its
   image had `filter:none`, `transform:none`, and `will-change:auto` at rest;
   the frame pseudo-element supplied `rgba(0,0,0,.35)`.
4. Reproduced brightness spikes using repeated CSS-only hover states on the
   real page. Keeping the artwork composited with `will-change:transform` did
   not resolve the controlled failure; that proposed change was rejected.
5. Compared the separate shade against image alpha over black on the same real
   card, with real pointer hover excluded during measurement. Both phases used
   the same zoom, hover scrim, logo, progress bar, native window and page.

For matched 9.78-second windows, sampled luminance above the logo was:

| Dimming method | Captured samples | Minimum | Maximum | Detected transient spikes |
| --- | ---: | ---: | ---: | ---: |
| Separate black shade | 322 | 67.04 | 144.73 | 10 |
| Image alpha over black | 313 | 66.87 | 91.78 | 0 |

The normal resting endpoint was approximately 91.7; the extra peaks were not an
intended brighter hover state. A spike detector required a rise and fall greater
than five luminance units within 150 ms. These are native-window capture samples,
not physical display scanout or sustained-FPS measurements. The user also
confirmed that the temporary live alpha preview removed the flicker.

## Implementation

- macOS Continue Watching artwork uses fixed `opacity:.65` against black,
  retaining the same dimming without a separately ordered shade plane.
- The backing belongs to the artwork link, inside the border. Putting it on the
  frame darkened the translucent border in the initial preview.
- The separate frame shade remains on web and Windows. Wordmarks, progress,
  Play blur, hover timing, keyboard focus and reduced-motion behavior are retained.
- macOS joins the existing idle player-chunk warmup used by Windows and Android.
  This removes a distinct cold-import workload from first hover; it is not the
  cause or fix of the reproduced brightness failure. The lifecycle regression
  failed for macOS before this change and passed afterward.

## Research and evidence

[WebKit's layer documentation](https://webkit.org/blog/8262/visualizing-layers-in-web-inspector/)
explains compositing surfaces, transform-related layer creation, repaint costs
and the memory tradeoff of promoting layers. The
[Filter Effects Level 2 draft](https://drafts.csswg.org/filter-effects-2/)
distinguishes stacking contexts from backdrop roots and describes opacity/filter
interactions; its backdrop-root definition is explicitly not a settled consensus.
Neither source alone establishes the cause of this app's failure.

Local investigation files are under `/tmp/navigator-hover-diagnosis`, including
the fixture sources, native-window recordings, `alpha-analysis.json`, and
`live-flash-contact.png`. Recordings contain the user's app view and must remain
local; they are not repository fixtures. Static CSS/lifecycle checks do not prove
pixel correctness; the real-app capture and user confirmation supply that evidence.

## Final packaged verification

The clean macOS 0.3.1 package uses frontend Build ID
`Ov8yV2_5mSLlmNa-Mfoz7`, based on `ef009f8` plus the reviewed hover/preload
patch. Production build, TypeScript, targeted regressions, bundle signature and
ZIP integrity checks passed. It was launched normally without Inspector. The
user confirmed that the packaged app fixes the brightness flicker and restores
the traffic lights. The clean archive was created before signed-in testing.
