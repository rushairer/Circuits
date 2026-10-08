# Architecture

- TypeScript + Vite browser SPA, deployed as static assets.
- Project model in `src/model.ts`, stable component and pin identifiers.
- `src/core/netlist.ts`: disjoint-set connectivity from explicit wires and internally connected breadboard rows/rails, including rail splits.
- `src/core/dc.ts`: experimental modified nodal analysis for one ideal DC battery and one approximated LED with resistive networks (parallel resistors allowed). The diode is a fixed 2 V drop, **not** SPICE.
- `src/core/simulator.ts`: compatibility entrypoint for the browser.
- The 12 illustrated parts include a toggleable ideal switch; the remaining advanced parts are display/connection only. Wire inspector edits color without changing electrical connectivity. Arduino visuals and code text editor do not execute firmware. No generalized sensor, transient, MCU or instrument simulation.
- `validProject` rejects invalid IDs, pins, malformed wires and unbounded numeric data.
- UI and SVG coordinates are not part of electrical connectivity; moving a part does not break attached wires.

See `docs/ROADMAP.md` for functionality not yet implemented.

- `src/core/geometry.ts`: pure world-space pin transforms, wire paths, geometry snap and bend insertion; optional wire bendpoints persist in JSON without altering electrical topology.

- `src/core/storage.ts`: versioned in-browser multi-project registry, migration from legacy single draft, bounded project count and lossless switching; stores projects locally (no account or cloud sync).

- `src/core/connections.ts`: identity-based wire addition, endpoint retargeting, duplicate detection, and nearest-pin lookup. Editor viewport is converted to world coordinates before selecting target terminals.

- `src/core/placement.ts`: spatial hit-testing and materialized resistor/LED physical insertion contacts. On release/rotate/import, contacts are reconciled from geometry; netlist consumes explicit connector IDs only, never viewport coordinates. Attached pins highlight green. Other components are not automatically inserted yet.

- `src/core/selection.ts`: immutable rigid group translations, batch rotation/deletion, and full-component marquee hit testing using rotated bounding boxes. Selection is transient UI state; wire endpoints remain identified by stable pins. Group drag reconciles contacts only when released.

- `src/core/viewport.ts`: pointer-anchored zoom and canvas-space panning; viewport navigation changes camera state only, not project positions or netlist.

- `src/core/dc-analysis.ts` is an optional, opt-in nonlinear DC teaching solver. It uses damped Newton nodal analysis, an exponential LED I–V approximation calibrated near 2 V/20 mA, one ideal battery, positive resistors, and ideal switches encoded by the netlist. It reports per-LED current, individual node potentials and ideal, infinite-input-impedance multimeter voltage differences. Voltage probes do **not** affect the circuit. It is not a device-accurate SPICE solver.
- The classic `evaluate` path remains the default to preserve older examples and expected 21.21 mA readings. The toolbar toggles models without changing persisted circuit wiring; UI reads experimental results only when that mode is active and running. Unsupported connections and unconnected probe pins produce explicit diagnostics rather than misleading numerical readings.

- `src/core/rc-transient.ts`: guarded one-capacitor analytical RC transient via resistor network Thevenin equivalent; at most one ideal battery, optional source-free discharge using explicit signed initial capacitor voltage. Computes V∞, Rth, τ=Rth*C, and deterministic 101 samples over 0–5τ. It is neither generic transient MNA nor a physical oscilloscope. The editor renders a read-only SVG voltage trace and an interactive sample slider; it never advances real simulation time or mutates the saved circuit.
