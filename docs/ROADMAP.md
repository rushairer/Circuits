# Circuits functional parity roadmap

## v0.1.x — editor and DC foundation (implemented and under verification)
- [x] Browser component palette, SVG editor, pin wiring, JSON import/export, browser persistence
- [x] Battery/resistors/one LED experimental DC modified nodal analysis, including parallel resistance
- [x] Breadboard five-hole strip groups, two separate power rails with midpoint splits
- [x] Import validation for component and pin references
- [x] 12 original SVG component illustrations; toggleable ideal switch, wire selection and color editing
- [x] Typecheck, unit tests, production build, persistent verified artifact, conditional Pages deploy
- [ ] Enable GitHub Pages via repository Settings and confirm live deployment
- [ ] Cross-browser E2E drag/rotate/wire testing and keyboard accessibility

## v0.2 — physical editing and project fidelity
- [ ] Precise pin-to-breadboard insertion and automatic connection on placement
- [ ] Wire bendpoints and endpoint editing, multi-selection and grid snapping
- [ ] Multiple saved local projects, versioned import schema and migrations
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
