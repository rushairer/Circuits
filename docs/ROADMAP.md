# Circuits functional parity roadmap

## Active milestone — alpha.11 (in progress)

See [Alpha.11 scope, implementation and acceptance](ALPHA11.md).

- [x] First batch: per-render endpoint snapshots, adaptive sparse crossing lookup, early decoration-budget exits, alpha.10 output-equivalence fixtures and reproducible geometry-only benchmarks
- [x] Add browser regression for 300-part / 2000-wire import, zoom, keyboard movement and undo (execution remains subject to the three-engine CI gate)
- [x] Second batch: unified pointer ownership, stable touch/pen capture, atomic preview cancellation, final-release sampling, compatibility-click filtering and unit/browser regression coverage
- [ ] Native Safari, physical touch/pen devices, OS palm/interruption behavior and multi-touch navigation verification
- [ ] Distance-ranked crossing/overlap selection with explicit candidate switching
- [ ] Screen-space waypoint alignment snapping and snap-release hysteresis
- [ ] Browser frame-time, long-task and input-latency profiling on large circuits
- [ ] Complete interaction acceptance and advance the package version from alpha.10 to alpha.11

## v0.1.x — editor and DC foundation (implemented and under verification)
- [x] Browser component palette, SVG editor, pin wiring, JSON import/export, browser persistence
- [x] Battery/resistors/one LED experimental DC modified nodal analysis, including parallel resistance
- [x] Breadboard five-hole strip groups, two separate power rails with midpoint splits
- [x] Import validation for component and pin references
- [x] 13 original SVG component illustrations; toggleable ideal switch, wire selection and color editing
- [x] Typecheck, unit tests, production build, persistent verified artifact, conditional Pages deploy
- [x] GitHub Pages enabled with commit-specific public HTTP deployment verification
- [x] Chromium browser E2E test gate: smoke, local project persistence and endpoint retargeting
- [x] Chromium, Firefox and WebKit E2E smoke/selection/movement/persistence regression on CI
- [ ] Real macOS Safari and additional visual + pointer-gesture regression audits

## v0.2 — physical editing and project fidelity
- [x] Resistor/LED lead-to-hole auto-snapping, explicit insertion contacts and automatic disconnect on move/rotation (other parts pending)
- [x] Persistent wire bendpoints (insert/drag/reset) and world-space grid snapping toggle
- [x] Direction-aware orthogonal routing for new wires and manual waypoints, initial dominant-axis inference, visible-button reversal, legacy path compatibility, routing persistence, overlap-avoiding palette placement and larger pointer targets
- [x] Wire endpoint reconnection via world-space target snapping, with duplicate/invalid connection safeguards
- [x] Tinkercad reference parity pass: green wire default, pin snap square and alignment line, wire-stroke drag inserts anchor, single-anchor Delete, R rotate, 0-9 wire colors, blank pan, Shift marquee and F content-fit (original still requires live visual verification)
- [x] Direct press-drag-release wiring between pins and breadboard sockets, live target preview, click-to-connect + click-bend workflow, Escape/cancel, screen-pixel snap tolerance, and accessible inserted leads
- [x] Shift-click selection, mouse marquee, rigid group drag with preserved net topology, atomic batch delete/rotate and undo
- [x] Focusable SVG components, Enter/Space activation, Ctrl/Cmd+A selection and arrow-key group nudge
- [x] Wheel pointer-centered zoom and space/middle-button drag pan with geometry tests
- [ ] Test screen reader semantics and multi-touch trackpad behavior
- [x] Multiple projects in local browser storage, duplicate/open/delete, versioned JSON imports and legacy draft migration
- [ ] Cloud-backed projects, share links and account login (out of scope for local prototype)
- [ ] Visual reference comparison and editor accuracy audits

## v0.3 — expanded electrical simulation
- [x] Experimental exponential LED I–V approximation with multiple series/parallel branches, solver convergence protection and per-LED overcurrent diagnostics
- [x] Experimental DC voltage difference of ideal high-impedance multimeter probes
- [x] Twelve ready-to-run sample circuits (single LED, parallel LED, series LED, voltmeter, RC charging/discharging, RC resistor-voltage and current measurement, static lossy switch, LED series ammeter, dual capacitors in series/parallel), created as separate local projects
- [ ] Calibrated device libraries, diode tolerances and nonlinear model fidelity
- [x] Analytical single-capacitor RC charge/discharge waveform, equivalent-resistance calculation for resistor networks, initial-voltage input and time-sample slider
- [x] Bounded 2–6 capacitor linear RC backward-Euler numerical solver with source-free discharge, signed branch currents and selectable waveform traces
- [ ] General nonlinear/inductor transient MNA, live current probes and physical oscilloscope
- [x] Virtual two-channel RC waveform viewer (capacitor voltage and computed branch current), movable time cursor, CSV export and bounded high-impedance voltage probing over capacitor-only paths
- [x] Resistor-node RC voltage readings reconstructed from KCL, source and capacitor voltage constraints, with disjoint floating-island safety checks
- [x] Optional RC coarse/fine timestep consistency check with fast-transient sampling warnings and analytical reference tests
- [x] In-circuit virtual shunt ammeter (0.1Ω) for nonlinear DC and RC, signed current and overrange diagnostics
- [x] Editable static switch closed-contact resistance with schema-v2 validation and ideal 0Ω compatibility
- [x] Analytical RC reference fixtures for contact resistance, shunt burden and multi-capacitor numerical convergence
- [ ] Real physical current-probe effects/fuses, timed switching events and wider external numerical benchmarks

## v0.4 — Arduino-compatible runtime
- [x] Limited, safe, deterministic source interpreter for single Uno built-in D13 Blink (pinMode/digitalWrite/delay) with visual timeline and explicit unsupported-syntax diagnostics
- [x] D13 HIGH/LOW wired external LED + resistor educational model via netlist, 5V/25Ω output source, polarity/overcurrent and unsupported-topology diagnostics
- [ ] Full AVR-compatible compilation and execution, general GPIO output/input pin propagation, PWM/ADC and peripheral accuracy
- [x] Bounded virtual Serial.begin/print/println monitor for literal output, time cursor and TXT export (not physical UART)
- [x] Bounded compile-time static for-loop unrolling (0–16 repeats), original D13/Serial whitelist and 128 expanded operation cap
- [ ] General serial expressions, Serial.available/read, interrupts and curated peripheral libraries

## v0.5 — workflow parity
- [ ] Block ↔ text coding, synchronized schematic, shared projects and parity audit

**Not yet functional parity.** A visible component does not imply an electrical model. No Autodesk affiliation.


- [x] Alpha.8 breadboard/trace/component SVG Z-order contract, socket input overlay and foreground wire edit handles; browser hit-test parity and electrical invariance regression


- [x] Alpha.9 orthogonal full-segment dragging, perpendicular-axis cursor and grid snapping, stable pin anchors, single-step undo/redo, cancellation and compatibility with legacy free-form paths
- [ ] Verify fine-grained Tinkercad segment deformation against the live authenticated original; continue junction/branch and device touch QA after this bounded approximation


- [x] Alpha.10 wire crossover arches with pointer-transparent insulation, stable zoomed wire pick tolerance and no implicit electrical contact; three-engine browser / unit regression
- [ ] Direct authenticated editor parity screenshots for exact arc curvature, overlay styling, narrow trace selection and touch screen gestures

- [x] Alpha.11 first batch: bounded crossing geometry and pin resolver caching, golden render/performance tests
- [x] Alpha.11 second batch: unified pointer ownership and cancel rollback for mouse, touch and pen; three-engine E2E
- [x] Alpha.11 third batch (phase 1): route-centerline ranking, repeated-click candidate cycling and stable drag target across crossover/overlap
- [ ] Alpha.11 next: waypoint snap hysteresis, alignment priorities, native device parity, browser input-to-paint latency/FPS evidence

- [x] Alpha.11 fourth batch: screen-pixel hysteresis for existing waypoint dragging, terminal/bend alignment, grid capture bounds, transient guides and atomic undo
- [ ] Extend snapping to new-wire authoring/whole-leg edits, and measure touch input-to-paint latency in real browsers/devices

- [x] Alpha.11 fifth batch: preserve unfinished manual wiring after pin-to-blank release, add temporary waypoint and final pin completion, Cmd/Ctrl +/- zoom with native text input protection
- [ ] Compare manual wire corner orientation, simulation editing lock and visual fidelity against authenticated Tinkercad original, then add device/frame performance QA

- [x] Alpha.11 sixth batch: Shift-select multiple wires, shared palette batch recolor, atomic batch delete/undo and netlist-preserving immutable operations
- [ ] Compare multiwire selection UI and feedback pixel-by-pixel with a logged-in original; do not claim exact parity from public tutorials alone

- [x] Alpha.11 seventh batch: Tinkercad reference 1–9,0 wire shortcut order (black through brown), palette labels and batch-selection regressions
- [ ] Verify 2026 authenticated original wire-type shortcuts, 12 swatch visual color values and current wire-color shortcut order

- [x] Alpha.11 eighth batch: official N note creation and Shift+N note visibility with draggable, editable world-space annotations, bounded schema-v2 import, safe SVG text and one-step undo
- [ ] Authenticated original annotations pixel/gesture parity: card sizing, insertion cursor, label wrapping, touch/pen native devices and grouped selection

- [x] Alpha.11 ninth batch: Normal/Hookup/Alligator/Automatic connector types, visible endpoint hardware, Shift+1..4 controls, persistent typed wires, and batch undo
- [ ] Verify official connector geometries, component-specific automatic wire-type rules and appearance on the 2026 authenticated reference editor

- [x] Alpha.11 tenth batch: LED Red/Green/Yellow/Orange/Blue/White inspector colors and visual simulation glow, backward-compatible optional field, undo/persistence and netlist safety tests
- [ ] Verify original LED colors visually and extend wavelength-dependent diode models separately with measured/public reference curves; do not equate color matching with accurate SPICE

- [x] Alpha.11 eleventh batch: right-hand Basic/All component categories plus Basic/Arduino Starters, bilingual search, empty states and independent-project examples
- [ ] Match authenticated original floating component properties, 2026 Starter categories, missing component families and palette icon artwork

- [x] Alpha.11 twelfth batch: read-only original-reference BOM view with component/value/color grouping, stable IDs, CSV export and simulation-neutral accessible dialog
- [ ] Build an actually generated schematic view from terminal connectivity and explicit breadboard unions; do not confuse a screenshot/visual route with an electrically correct diagram

- [x] Alpha.11 thirteenth batch: first real read-only Schematic view based on existing Netlist, including breadboard buses, terminals, switch states, explicit net labels, bounded generation and SVG export
- [ ] Match Tinkercad's auto-layout and standard symbols more closely; eliminate crossing ambiguity and add zoom/pan and useful wire-level diagram navigation without changing electrical identity

- [x] Alpha.11 fourteenth batch: Netlist-driven orthogonal schematic bus lanes, visual insulated crossings, stable R/D/C-style reference labels, non-mutating schematic-only zoom controls and added unit/browser tests
- [ ] Verify dense schematic routing, complete symbol standards (IEC/ANSI), schematic viewport gestures, native Safari and authenticated Tinkercad 2026 screenshots; the new router is a bounded pedagogical approximation, not a proven 1:1 clone

- [x] Alpha.11 fifteenth batch: single-part contextual quick property panel (canonical value/LED/RC editor handler, rotate/delete/close), collision-ranked CSS-pixel placement and grouped toolbar without changing scene width or schema
- [ ] Authenticated original reference: floating property card position, typography, wire-specific property popup, responsive toolbar hierarchy, and touch/pen use; verify by visual comparison before claiming 1:1

- [x] Alpha.11 schematic safety patch: reject different-net collinear strokes and crossings colliding with live net junctions; use complete N-labeled terminal fallback rather than visually fabricating connectivity

- [x] Alpha.11 dense schematic: increase per-net orthogonal bus-lane spacing from 14 to 28 view units so radius-10 insulating crossover bridges cannot collide on adjacent trunks, with 12-net regression; neither terminal IDs nor electrical topology changes

- [x] Context quick-card collision regression: bounded candidate search prioritizes zero overlap with actual clickable neighboring parts and selected part before nearest-side preference; native controls cannot cover nearby component clicks in 1024px tablet layout

- [x] Alpha.11 resistor property foundation: validate optional resistor SI unit p/n/u/m/Ω/k/M/G and immutable canonical-ohm changes, preserving legacy project/netlist identities; follow with connected inspector controls

- [x] Alpha.11 resistor SI prefix controls in canonical right Inspector and canvas quick properties; numeric/prefix edits are single history entries and imported project field remains optional
