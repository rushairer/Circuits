# Circuits functional parity roadmap

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
- [x] Wire endpoint reconnection via world-space target snapping, with duplicate/invalid connection safeguards
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
- [ ] Full AVR-compatible compilation and execution, external GPIO-connected circuit propagation, PWM/ADC and peripheral accuracy
- [ ] Serial monitor and curated peripherals/libraries

## v0.5 — workflow parity
- [ ] Block ↔ text coding, synchronized schematic, shared projects and parity audit

**Not yet functional parity.** A visible component does not imply an electrical model. No Autodesk affiliation.
