# Circuits functional parity roadmap

## v0.1.x — editor and DC foundation (implemented and under verification)
- [x] Browser component palette, SVG editor, pin wiring, JSON import/export, browser persistence
- [x] Battery/resistors/one LED experimental DC modified nodal analysis, including parallel resistance
- [x] Breadboard five-hole strip groups, two separate power rails with midpoint splits
- [x] Import validation for component and pin references
- [x] 12 original SVG component illustrations; toggleable ideal switch, wire selection and color editing
- [x] Typecheck, unit tests, production build, persistent verified artifact, conditional Pages deploy
- [ ] Enable GitHub Pages via repository Settings and confirm live deployment
- [x] Chromium browser E2E test gate: smoke, local project persistence and endpoint retargeting
- [ ] Expand Firefox/WebKit interaction tests, drag/rotate regressions and keyboard accessibility

## v0.2 — physical editing and project fidelity
- [x] Resistor/LED lead-to-hole auto-snapping, explicit insertion contacts and automatic disconnect on move/rotation (other parts pending)
- [x] Persistent wire bendpoints (insert/drag/reset) and world-space grid snapping toggle
- [x] Wire endpoint reconnection via world-space target snapping, with duplicate/invalid connection safeguards
- [x] Shift-click selection, mouse marquee, rigid group drag with preserved net topology, atomic batch delete/rotate and undo
- [x] Focusable SVG components, Enter/Space activation, Ctrl/Cmd+A selection and arrow-key group nudge
- [ ] Refine pan/zoom gestures and test screen reader semantics
- [x] Multiple projects in local browser storage, duplicate/open/delete, versioned JSON imports and legacy draft migration
- [ ] Cloud-backed projects, share links and account login (out of scope for local prototype)
- [ ] Visual reference comparison and editor accuracy audits

## v0.3 — expanded electrical simulation
- [ ] Nonlinear LED/diode I–V and multiple LED branch models
- [ ] Capacitor/inductor transient solver, current/voltage measurement and waveforms
- [ ] Parameterized switches, instrumentation, validation against reference fixtures

## v0.4 — Arduino-compatible runtime
- [ ] Safe/deterministic AVR-compatible execution, sketch compilation, GPIO/PWM/ADC
- [ ] Serial monitor and curated peripherals/libraries

## v0.5 — workflow parity
- [ ] Block ↔ text coding, synchronized schematic, shared projects and parity audit

**Not yet functional parity.** A visible component does not imply an electrical model. No Autodesk affiliation.
