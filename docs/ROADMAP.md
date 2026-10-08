# Circuits functional parity roadmap

## v0.1.x — editor and DC foundation (in progress)
- [x] Browser component palette and SVG editor, pin wiring, JSON import/export, local persistence
- [x] Battery / resistors / one LED experimental DC modified nodal analysis, including parallel resistance
- [x] Basic breadboard top/bottom rail split, five-hole strip net connectivity
- [x] Import validation for valid component/pin references
- [x] Actions: typecheck/tests/build, verified artifact, conditional Pages deployment
- [ ] Enable GitHub Pages in repository Settings and verify the site is actually online
- [ ] Component pin rendering during rotation and cross-browser E2E interactions

## v0.2 — physical editing
- [ ] Precise breadboard contact placement, pin insertion and automatic connection
- [ ] Wire bends and endpoint editing, multi-select and snap, multiple saved local projects
- [ ] Expand original UI illustrations to full component set; formal project schema migrations

## v0.3 — simulation
- [ ] Multi-LED, diode I/V, resistor/capacitor/inductor, transient solver and safety diagnostics
- [ ] Switches, instrumentation (multimeter, oscilloscope), measured waveform fixtures

## v0.4 — microcontroller
- [ ] Deterministic AVR runtime, Arduino code compilation, GPIO/PWM/ADC, serial console and libraries

## v0.5 — workflow
- [ ] Blocks/Text code, schematic synchronization, shared projects, parity audit

**Status:** not a complete 1:1 clone, no Autodesk affiliation. A visible component is not proof of electrical support.
