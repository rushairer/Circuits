# UI interaction contract

Read the root AGENTS.md first. These rules supplement, never replace, electrical and SVG layer invariants.

- `pointer-input.ts` owns DOM pointer lifecycle; `../core/pointer-session.ts` owns the pure contact/owner state. The root workbench passes editing callbacks, not circuit model data, to this adapter.
- Touch/pen capture belongs to the stable `#app`, never a pin, `#board` or `#scene` replaced during drawing. Hit-test release coordinates against the live canvas; a captured event target is not a destination terminal.
- Only the owning pointer may move or finish a preview. A second contact aborts the current edit and blocks both contacts until released. Do not describe this as pinch navigation or hardware palm rejection.
- Escape, pointercancel, lost capture, blur and hidden documents must not commit a preview. Restore the pointer-down model/camera snapshot; never leave component or waypoint mutations to be saved by a later unrelated action.
- Do not rebuild the UI on idle blur: a native file chooser or unfinished text input must remain intact. An orphan pointerup after reset must not start a wire through its subsequent compatibility click.
- Mouse retains native click/dblclick. Direct-input taps are invoked once at release and their compatibility click is suppressed. Keep keyboard/assistive activation and native toolbar/input/select behavior working.
- Thresholds are CSS pixels (touch 8, pen/mouse 5), not world-grid snapping or physical accuracy. Apply the final release sample; reject pen barrel/eraser buttons as new edits.
- Regression gates: all core tests plus `e2e/pointer-input.spec.ts`, `e2e/pointer-boundaries.spec.ts` and the existing three-engine workbench suite. Native touch taps and Chromium CDP pointer injection are not physical-device certification. See docs/ALPHA11.md.

Reference: W3C Pointer Events Level 3, https://www.w3.org/TR/pointerevents3/ (capture, cancellation, click dispatch and touch-action). Do not assume preventDefault(pointerdown) by itself suppresses click.

- Wire strokes in intersections/overlaps are picked via `../core/wire-picking.ts` geometry in CSS-pixel distance, not transient SVG z-order or broad invisible hit paths. Preserve pin, socket, selected endpoint and bend-handle priorities; keep candidate cycling out of project JSON and undo. Pointerdown drag and click must resolve the same visually selected wire.
