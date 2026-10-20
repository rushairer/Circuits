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

- Existing waypoint dragging uses `../core/waypoint-snap.ts` only as transient gesture state, with per-axis CSS-pixel enter/release hysteresis, terminal/bend-guide priority over grid and pointer-transparent alignment lines. Never persist snap memory or conflate visual alignment with electrical connection.

- A wire gesture released over blank *canvas* remains an uncommitted wire draft; the next blank click adds a waypoint and an actual terminal completes it. The gesture released on toolbar/inspector cancels; Escape, pointercancel, capture loss, blur and hidden document still discard drafts. Do not persist unfinished wiring or count it as undo.
- Command/Ctrl +/− zoom is view-only; native inputs/selects/textareas retain keyboard shortcuts. Keep documentation honest about authenticated Tinkercad parity verification.

- Shift-clicking actual wire strokes builds a UI-only `selectedWireIds` batch. Recolor/delete through `../core/wire-batch.ts` as one undo entry; never infer electrical junctions or mutate endpoint IDs. Toggling to a component or blank canvas clears this selection; initiating segment drag edits exactly one wire, not a batch.

- The Tinkercad historical wire-color shortcut keys use digits 1..9 for the first nine swatches and 0 for Brown (tenth swatch). Preserve default Green and actual persisted six-digit colors. Display keyboard labels in the color chooser; never shift a saved wire's color while migrating.

- Annotation mode (N or toolbar) is a one-shot pointer-safe canvas placement. Shift+N toggles visibility without deleting persisted notes. A note drag is owned by one pointer; Escape, loss of capture, second contact and blur restore the pointer-down snapshot. Note movement is world-space, must not create electrical connections, and uses its own immutable edit path.
- SVG note text is always escaped and bounded (never foreignObject/innerHTML from user text). Changes to the editor textarea may update DOM using textContent, but must save once on change/blur with one undo record. Suppress global N shortcuts in all native text input controls.

- Connector type selector and Shift+1..4 shortcut apply to a draft or selected wire batch. Keep legacy type-less wires identical to prior painter goldens and ensure `wireConnectorMarkup` shrouds/clips are pointer-transparent and sit behind actual physical component/pin layers. Changing type is one history item; Automatic resolution must never synthesize an electrical connection.

- The LED Color inspector is an original-reference visual property of real LED parts only. Editing it must preserve simulation state and undo history, change lens/foot/glow together, and never alter electrical topology. Imported projects without `ledColor` stay Red. Do not hijack shortcuts while its native select has focus.

- Component browser category is UI-only and validated with `src/core/component-browser.ts`; persist only its enum to a separate localStorage preference, never `Project`. Basic displays supported common parts; All displays every implemented kind; a search in Basic may find implemented All kinds. Native select/search preserve focus and caret, do not capture global keyboard shortcuts.
- Starter categories must call the existing independent-workspace example loader, never overwrite the active circuit, invent unsupported Autodesk examples, or add netlist identities by browsing. Restore the chosen category after closing a selected-part inspector.

- The BOM toolbar opens a read-only dialog over the canvas, backed by `../core/bom.ts`. It must not persist UI state, stop simulation, alter netlist connections or add undo records. Escape/backdrop closes; Tab and Shift+Tab trap focus on dialog controls, and all global deletion/wiring hotkeys are blocked while it is open.
- BOM export is UTF-8 CSV with quoted fields and spreadsheet formula injection neutralization; never render untrusted names or IDs without HTML escaping. Original Schematic view remains unimplemented separately.

- The generated Schematic is an independent read-only dialog. Use `../core/schematic.ts` to project ONLY the actual `buildNetlist` identity classes; geometric wire crossings, route changes, lens colors, and component canvas positions must not create hidden electrical joins. Bare breadboard copper groups are represented only when referenced by authored wires/insertions.
- `schematic-panel.ts` must escape project title and all terminal/user strings before SVG/HTML rendering; SVG export has no active content or external resources. Disable export, and show an explicit explanation, when whole-diagram bounds cannot be satisfied; never silently truncate the netlist.
- Schematic dialog Escape/Tab/Shift+Tab and backdrop close are modal and cannot trigger canvas editing, Delete, undo, pan, or simulation changes. Preserve preexisting BOM and scope focus flows.

- The contextual quick property panel is a CSS-pixel overlay calculated from the selected SVG part's DOM bounds. It must not resize the canvas or alter electrical state. Forward quick select/number changes through the canonical inspector handler (validation/undo); never duplicate input IDs, persist overlay position, or intercept shortcuts in native form elements.
- Toolbar groups are presentational, preserve existing data-action identities and hotkeys, and must not block the primary Run control or hide a command behind an inaccessible scroll trap.

- Context quick-property chrome must be pointer-transparent except actual inputs/buttons. A new popover must never intercept a blank-canvas deselect/pan or prevent selecting another real SVG component; avoid duplicated data-action selectors for old inspector actions (the quick switch has its own delegated action).

- A single selected wire has a contextual quick card anchored to its visible SVG conductor. Quick color/type edits delegate to the canonical sidebar/toolbar change handlers; direction flips use the existing one-undo path. Never persist popup placement, alter endpoints, capture blank-canvas clicks or display a single-wire card during Shift batch wire selection. Use uniquely named quick button actions.

- The schematic network selector is a view-only DOM class projection; it may dim other network strokes/terminals but must never remove or mutate any SVG electrical IDs, circuit JSON, undo history, analysis, or exported standalone SVG. Include the native select in modal Tab trapping, preserve focus/highlight across view-only zoom, and reset the selection when reopening the dialog.

- Auto-schematic orthogonal lanes must reserve clearance for full crossover bridge glyphs, not only line strokes. Keep src/core/schematic.ts and schematic-routing.ts step constants synchronized so net labels remain right of every bus; increase diagram width rather than silently truncate. Preserve full Netlist IDs and deterministic layout.

- Optional Part.name is a bounded (80-character), display-only instance label. It MUST NOT replace stable Part.id or enter terminal keys, network unions, component selection identity, insertion matching or BOM grouping. Validate imported strings and reject controls; escape in HTML/SVG, preserve absent legacy names. Quick and full Inspector name inputs share the immutable renamePart + commitVisualEdit path (single undo, no simulator interruption). SVG export must remain inert for malicious names.

- Floating property placement must treat **all clickable native input/button rectangles** as potential obstructions: the full panel box should prefer zero overlap with every other SVG part (and its terminals), not merely shorter distance to selected item. Keep collision search bounded, CSS-pixel-based and independent of project state. The three-engine Shift-click resistor-to-LED test guards this when extra fields increase panel height.

- Tinkercad resistor SI-prefix units are persisted as optional, resistor-only Part.resistanceUnit; actual Part.value is ALWAYS canonical ohms. Selecting another unit scales the unchanged displayed mantissa, so it is an electrical edit with one undo. Reject malformed units/invalid finite resistance on import or edit. Existing projects without unit default to Ω and remain byte-for-byte compatible until edited.

- Resistor dual-field quick and full Inspector must share resistorValueFields() + changeResistorValue() to guarantee one validation/undo path. Prefix selection is a physical resistance edit; preserve nominal number while multiplying the unit. Resistor body label follows the chosen prefix, while BOM and solver remain in canonical ohms.

- Resistor artwork is computed solely from canonical ohms by src/core/resistor-bands.ts using IEC 60062 4/5 band digits/multiplier and an illustrative fixed tolerance (gold/brown); it does not simulate manufacturing tolerance. Paint a nominal color code only when it encodes the exact value to 1e-9 relative accuracy; otherwise show the numeric value without misleading stripes. Keep all physical pins and lead positions unchanged.

- Floating quick-card collision ranking must first prefer completely clear positions, then hard-prefer zero overlap with the **selected SVG component** over lower neighbour-coverage cost. Otherwise a native quick input can intercept the Playwright/WebKit first-click after a selection rerender. Search bounded nearby-obstacle edges to avoid every candidate slot being occupied in tablet views; keep candidate evaluation bounded for 300-part projects.

- Contextual popup placement must prioritize unobstructed **SVG activation centers** (with ±10px safety halo) ahead of total rectangular area, including selected part and adjacent parts. A huge breadboard bbox cannot justify making a tiny LED unclickable. `e2e/floating-properties.spec.ts` checks the actual 1024px LED `elementFromPoint`, using Chromium, Firefox and WebKit in a fast CI preflight.

- Quick popup positioning now treats *real SVG electrical terminal and wire handle centers* as protected interactive targets. Collect up to 16 nearby non-breadboard parts (max 32 pins each), plus selected bend and endpoint handles, and cap the hot-point array. Prioritize zero overlapping pin/handle activation zones before decorative SVG area. Hit geometry is only a CSS-pixel UI concern and MUST NOT create net connections.
