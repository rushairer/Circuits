# Architecture

- TypeScript + Vite browser SPA, deployed as static assets.
- Project model in `src/model.ts`, stable component and pin identifiers.
- `src/core/netlist.ts`: disjoint-set connectivity from explicit wires and internally connected breadboard rows/rails, including rail splits.
- `src/core/dc.ts`: experimental modified nodal analysis for one ideal DC battery and one approximated LED with resistive networks (parallel resistors allowed). The diode is a fixed 2 V drop, **not** SPICE.
- `src/core/simulator.ts`: compatibility entrypoint for the browser.
- The 13 original illustrated parts include a toggleable switch; the remaining advanced parts are display/connection only. Wire inspector edits color without changing electrical connectivity. Arduino firmware is not compiled/executed; only a statically interpreted, bounded built-in D13 Blink preview is supported. No generalized sensor, transient, MCU or instrument simulation.
- `validProject` rejects invalid IDs, pins, malformed wires and unbounded numeric data.
- UI and SVG coordinates are not part of electrical connectivity; moving a part does not break attached wires.

See `docs/ROADMAP.md` for functionality not yet implemented.

- `src/core/geometry.ts`: pure world-space pin transforms, wire paths, geometry snap and bend insertion; optional wire bendpoints persist in JSON without altering electrical topology.

- `src/core/storage.ts`: versioned in-browser multi-project registry, migration from legacy single draft, bounded project count and lossless switching; stores projects locally (no account or cloud sync).

- `src/core/connections.ts`: identity-based wire addition, endpoint retargeting, duplicate detection, and nearest-pin lookup. Editor viewport is converted to world coordinates before selecting target terminals.

- `src/core/placement.ts`: spatial hit-testing and materialized resistor/LED physical insertion contacts. On release/rotate/import, contacts are reconciled from geometry; netlist consumes explicit connector IDs only, never viewport coordinates. Attached pins highlight green. Other components are not automatically inserted yet.

- `src/core/selection.ts`: immutable rigid group translations, batch rotation/deletion, and full-component marquee hit testing using rotated bounding boxes. Selection is transient UI state; wire endpoints remain identified by stable pins. Group drag reconciles contacts only when released.

- `src/core/viewport.ts`: pointer-anchored zoom and canvas-space panning; viewport navigation changes camera state only, not project positions or netlist.

- `src/core/dc-analysis.ts` is an optional, opt-in nonlinear DC teaching solver. It uses damped Newton nodal analysis, an exponential LED I–V approximation calibrated near 2 V/20 mA, one ideal battery, positive resistors, and static ideal or finite-resistance switches encoded by the netlist and passive-branch layer. It reports per-LED current, individual node potentials and ideal, infinite-input-impedance multimeter voltage differences. Voltage probes do **not** affect the circuit. It is not a device-accurate SPICE solver.
- The classic `evaluate` path remains the default to preserve older examples and expected 21.21 mA readings. The toolbar toggles models without changing persisted circuit wiring; UI reads experimental results only when that mode is active and running. Unsupported connections and unconnected probe pins produce explicit diagnostics rather than misleading numerical readings.

- `src/core/rc-transient.ts`: guarded one-capacitor analytical RC transient via resistor network Thevenin equivalent; at most one ideal battery, optional source-free discharge using explicit signed initial capacitor voltage. Computes V∞, Rth, τ=Rth*C, and deterministic 101 samples over 0–5τ. It is neither generic transient MNA nor a physical oscilloscope. The editor renders a read-only SVG voltage trace and an interactive sample slider; it never advances real simulation time or mutates the saved circuit.

- `src/core/rc-network.ts` adds a separate, guarded linear RC nodal solver (2–6 ideal capacitors, 1–80 positive resistors, at most one ideal battery, fixed ideal switches and breadboard groups). It validates contradictory initial capacitor voltages and hard source loops, factorizes its constant conductance matrix, and applies fixed-step backward Euler over 1000 internal steps, returning 101 sampled capacitor voltage/current pairs. t=0 current is explicitly unknown. This is a numerical teaching approximation, not SPICE or an oscilloscope.
- The RC workspace chooses the existing exact single-capacitor analytic solver for zero/one capacitor and the new numerical solver for two or more. In numerical mode users select the capacitor trace, sample time and 0.1–10 s display window, all held in transient UI state; saved circuit electrical topology is unchanged.

- `src/core/scope.ts`: model-independent, validated 101-frame captures derived from `analyzeRC` or `analyzeRCNetwork`, with explicit unavailable t=0 numerical current and machine-readable voltage/current CSV. Snapshots are detached from solver-owned arrays.
- `src/core/rc-probes.ts`: non-invasive, ideal voltmeter computing signed differences between connected modeled RC nodes, including resistor drops reconstructed by supernode KCL from sampled capacitor voltages and a known ideal source; unknown floating islands remain unmeasured. `src/ui/scope-panel.ts` renders a modal, two-channel virtual scope. The scope and CSV export are read-only, not physical hardware instrumentation or an Arduino runtime.

- `src/core/rc-probes.ts` now reconstructs bounded linear resistor-node potentials from sampled capacitor voltage constraints plus a single ideal battery using voltage supernodes and KCL. Probe pins are never simulated as loads. A virtual voltage difference is returned only within the same connected modeled island; contradictory voltage constraints, disconnected islands and invalid nets remain explicitly unavailable.
- `src/core/rc-accuracy.ts` compares fixed-step backward-Euler RC integrations at 10 and 20 internal substeps per output interval and warns when the first displayed sample spans most of the transient. This is a **numerical self-consistency diagnostic, not a verified absolute error estimate**. It runs only when requested in the multi-capacitor UI and is invalidated on circuit edits/window changes.

- `src/core/resistive-branches.ts` is the canonical DC/RC passive-edge list. Resistors, the fixed 0.1Ω ammeter shunt and finite closed-switch contact resistance share this stamping path; an ideal closed 0Ω switch is merged by `buildNetlist`, and an open switch is absent. RC probe KCL uses these same passive edges.
- Signed ammeter currents use shunt-node potentials; both terminals must be wired. DC reports overrange above 200mA, while the RC viewport reports time-indexed shunt current. Neither overrange nor static switch toggling models a real meter fuse or live mid-trace switch event. Analytic RC and two-capacitor numerical fixtures are reference tests, not external SPICE validation.

- `src/core/uno-preview.ts` contains a pure, statically bounded D13-only teaching sketch interpreter. It accepts only simple `void setup` / `void loop`, D13 `pinMode`, `digitalWrite`, `delay`, plus simple numeric aliases. It never executes user-supplied JavaScript or C++, compiles no AVR binary and does no external I/O. The generated finite loop events are sampled by timestamp without timers; the view renders a separate GPIO13 on-board LED indicator. Project code edits and workspace changes invalidate UI-only preview state. Since alpha.2, the preview can additionally query a separate virtual D13 output circuit (see `src/core/gpio-d13.ts`), but it still neither executes AVR machine code nor alters the existing DC/RC solver mode.

- `src/core/gpio-d13.ts` maps a single wired Uno D13/GND network into a **non-persisted** 5V HIGH / 0V LOW source plus 25Ω series driver resistor. This synthetic project is evaluated using the existing nonlinear DC LED model (with an explicitly opt-in 0V virtual source), preserving actual breadboard groups, switches and explicit terminal wires. It rejects external batteries, unsupported connected devices, V5, unconnected output/ground and direct output-ground shorts. Signed source current, per-LED current/overcurrent and driver-current warnings are UI snapshots; they never modify saved circuits or claim real AVR electrical limits.


- `src/core/uno-preview.ts` statically interprets bounded literal Serial.begin/print/println alongside D13 operations. The pure `sampleUnoSerial` returns a recent deterministic output tail for a requested cursor position. The code inspector escapes monitor text, bounds visible history, and exports only the visible TXT snapshot. Serial-only sketches omit the D13 GPIO electrical source. Nothing executes as C++ or AVR.
