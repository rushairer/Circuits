# Circuits — Agent development contract

## Technology and boundaries
- TypeScript strict mode, Vite SPA, GitHub Pages. Keep the app portable and client-side for the current milestone.
- Original illustrations and implementations only. Do not copy proprietary Autodesk/Tinkercad source or assets.
- Functional parity with Tinkercad Circuits is a roadmap goal, **not** a current claim.

## Architecture
- `src/model.ts`: stable component IDs, terminal names, serialization and import validation.
- `src/core/netlist.ts`: connectivity only (wires, breadboard strips/rails, ideal switches); no UI geometry in electrical identity.
- `src/core/dc.ts`: experimental one-source/one-LED resistive MNA circuit. Do **not** equate the fixed 2 V LED approximation with nonlinear diode physics or SPICE.
- `src/main.ts`: user interaction and SVG view. Avoid dynamic unescaped HTML for untrusted imported project fields.
- For every new simulated part, add component/terminal invariants, solver tests, and truthful status in UI and docs. Merely drawing a component is not simulation.

## Quality gates
- Before claiming ready: `npm run typecheck`, `npm test`, `npm run build`.
- Distinguish passing CI from a live GitHub Pages deployment. Pages needs a one-time repository-level activation; the workflow intentionally skips deployment when unavailable.
- Preserve `main`, avoid destructive resets, commit in coherent small batches and track remaining limitations in docs.
- Use [ROADMAP](docs/ROADMAP.md) for scope; never claim arbitrary 1:1 parity.

## v0.2 world-space editing
- A wire bend is a persisted world-space visual coordinate. A wire's electrical connectivity is determined **only** by endpoint IDs, not by its drawn route.
- Use `src/core/geometry.ts` for rotated terminals and wire paths. Keep view transforms and grid snapping out of the netlist.
- Extend import validation alongside any model field, and add unit tests for malformed JSON and connection invariants.

## Connection editing
- Reconnect wire endpoints only through `src/core/connections.ts`; preserve wire ID, color and explicit bendpoints, and reject duplicate connections or invalid terminals.
- Pin hit-testing uses world space after inverse camera transform; never use pixels as electrical pin identity.

## Physical breadboard insertion
- `src/core/placement.ts` detects/snaps resistor and LED leads near physical breadboard holes. Only these two kinds have automatic placement contacts at this stage.
- `Project.insertions` holds explicit pin-to-hole identities; `buildNetlist` unions these contacts without performing geometry calculations.
- Reconcile physical contacts on placement, rotation, import, component deletion and drag release; moving off-board must break contact. Never infer conductive contact from visual overlap with the board body.

## UI browser verification
- `npm run test:e2e` uses Playwright Chromium and Vite's local dev server; run this alongside TypeScript, unit tests and build when browser dependencies are available.
- In GitHub Actions the browser suite is a release quality gate; a failing browser test must prevent Pages deployment.

## Multi-selection and batch edits
- `src/core/selection.ts` owns batch transforms/deletes and marquee geometry. Keep changes immutable and preserve stable wire identities; never infer circuit contact from visual paths.
- Shift-click and empty-canvas marquee build a transient selected-ID set. Group drag uses one snapped displacement; contact reconciliation happens on release.
- Undo and redo must keep an entire batch operation as one history entry and must not leave dangling wires or stale insertions.

## Keyboard accessibility
- SVG parts carry tabindex, role=button, aria-label, and aria-pressed. Enter/Space and Shift+Enter/Space activate selections.
- Arrows nudge the whole selected set in world coordinates; Alt+Arrow is precise. Each nudge is one undo entry and reconciles physical breadboard contacts.

## Browser compatibility gate
- CI runs Playwright in Chromium, Firefox and WebKit; any browser regression blocks Pages deployment. Keep tests portable rather than disabling failing browsers.
- Linux WebKit covers the engine but not native macOS Safari behavior; retain native Safari QA as an independent later task.

## Canvas navigation
- Camera pan/zoom must never modify circuit world coordinates. `src/core/viewport.ts` preserves the point underneath the cursor on zoom.
- Space+left-drag or middle-button drag pans. Blank-canvas unmodified left drag remains marquee selection. Never intercept pointer events that start on toolbar/inspector UI.

## Experimental nonlinear DC analysis (v0.3)
- Keep `src/core/dc-analysis.ts` independent from the legacy `evaluate` path. The exponential LED approximation is *not* a manufacturer-accurate physical model; flag overcurrent and unsupported configurations.
- The initial experimental model supports one battery, positive resistors, ideal two-terminal switches and multiple LED branches; multimeter probes are ideal open-circuit voltage measurements. No MCU, general SPICE transient solver, physical current meter/fuse or high-voltage safety model; the virtual current meter is a finite shunt.
- When adding a nonlinear element, test normal, reverse, parallel, series, open, shorted and failure-to-converge behavior. Never display a voltage of 0 V for an unconnected or uncomputed meter probe.

## Starter example fixtures
- `src/core/examples.ts` defines stable sample circuits as versioned valid JSON projects. Each example must pass `validProject` and the appropriate nonlinear DC, analytical RC, or numerical RC reference fixtures.
- Choosing a sample creates a new workspace slot; do not overwrite an existing user circuit. Sample selection opts into the appropriate experimental RC or nonlinear DC mode but still requires the user to start simulation.

## GitHub Pages release identity
- Vite adds a `circuits-revision` HTML meta tag from the build's exact git SHA (or `local` for a dev build).
- The Pages job checks that *public HTTP* serves the new SHA, not merely any previous Circuits page. Deployment artifacts may occasionally lag in GitHub's APIs: one bounded retry is permitted, not infinite retries or a false green status.

## RC transient analysis (v0.3.0-alpha.3)
- `src/core/rc-transient.ts` independently calculates the Thevenin equivalent of a *single ideal capacitor* across resistor/switch/breadboard networks, optionally powered by one ideal battery. Its output is an analytical step response sampled over 0–5τ; it is not a numerical multi-element transient solver.
- `Part.value` is in microfarads only for `kind==='capacitor'`. The optional capacitor-only `initialVolts` is the t=0 signed voltage from pin a to pin b, validated by `validProject`; existing v2 JSON documents without the field remain valid.
- Reject missing finite RC discharge paths, shorts, unsupported connected parts or too many capacitors instead of producing invented waveforms. Switching a circuit after startup is not simulated; switch state is fixed over the entire analytical trace.
- Keep classic fixed 2V and nonlinear DC modes independently available, and do not repurpose the ideal DC voltmeter as an RC oscilloscope.

## Multi-capacitor numerical RC (v0.3.0-alpha.4)
- Do not break the existing `analyzeRC` single-capacitor analytical reference fixtures. For 2–6 capacitors, use the separate `src/core/rc-network.ts` backward-Euler solver and keep sampling results bounded and finite.
- Capacitor initial voltages are signed V(a)-V(b). Conflicting zero-time capacitor/ideal battery constraints must be rejected instead of simulating impulses or silently forcing an arbitrary state. Current at t=0 is deliberately `null`.
- The timestep/window selector and chosen capacitor trace are UI-only controls; they must not rewrite electrical project JSON. Graphical traces are teaching approximations, not live oscilloscopes.

- Keyboard shortcuts must not hijack native `<input>`, `<textarea>` **or `<select>`** controls; trace/window selectors remain keyboard-operable without moving selected components.

## Virtual RC measurements (v0.3.0-alpha.5)
- The virtual oscilloscope renders already computed RC samples in two independently scaled channels (V and mA). It must not drive solver time, imply hardware measurements, or persist transient UI state to project JSON. Export CSV with explicit units and blank cells for null numerical currents.
- `src/core/rc-probes.ts` measures signed voltage only between electrically connected, modeled RC nodes (capacitor or resistor) using explicit netlist IDs, capacitor samples, known ideal source constraints and resistor KCL. Never guess voltages across unrelated floating islands or treat an unconnected meter as 0 V. Multimeter display and inspector must update during time scrubbing.
- The modal must be keyboard dismissible and focus-contained; native select/range controls must not trigger global canvas shortcuts.

## Superseded CI runs and browser provisioning
- On main pushes, GitHub Actions cancels older runs of the same branch. Only the final HEAD's successful quality gate and public Pages SHA are release evidence; a cancelled intermediate run is not a code regression.
- Cache Playwright browser binaries by project dependency manifest, while still installing OS/browser dependencies via `--with-deps`. Browser provisioning has a bounded timeout rather than blocking publishing indefinitely.

- Read-only RC graph overlays must allow selecting electrical components beneath them (`pointer-events:none`); only genuine panel controls (ranges/selects/buttons) may intercept pointer input. The RC voltmeter browser regression covers this overlay interaction.

## v0.3.0-alpha.6 RC node measurement and convergence
- The high-Z RC meter can now measure resistor-node voltage **only** when the two probes are in the same connected modeled island. `src/core/rc-probes.ts` uses sampled capacitor and source voltage constraints plus passive resistor KCL; do not infer potentials between distinct floating networks. Preserve old signed-capacitor-path tests.
- `assessRcConvergence` compares 10 vs 20 implicit-Euler substeps and detects grossly under-resolved first-sample changes; never describe its percentage as a physical accuracy bound. A pass indicates internal consistency at those two step sizes only.
- The optional diagnostic is UI-only and must be invalidated when the electrical project, solver mode or time window changes. It must not rewrite project JSON or alter the existing default integration.

## v0.3.0-alpha.7 current meter and switch-contact contract
- Model current-measuring ammeter as a fixed 0.1Ω resistive shunt with positive/negative terminals; both ends must be wired before a trusted current is shown. Do not allow overriding its resistance using the generic part value. Positive direction is from positive to negative, and ±200mA is an educational overrange only.
- Centralize resistor, ammeter and non-ideal closed-switch stamping in `src/core/resistive-branches.ts`. Only closed switches with 0Ω contact are unioned as conductors. An open switch never participates in conductance stamping.
- contactOhms is optional, switch-only, validated as 0Ω or 0.1–1,000,000Ω. Preserve old schema-v2 projects with missing contactOhms. Switch toggling re-solves RC from t=0; no mid-waveform switch-time simulation.
- RC/LED reference tests must verify shunt burden, switch resistance, polarity, open terminals, overrange and capacitor series/parallel analytical comparisons. Keep historical modes independent.

## v0.4.0-alpha.1 deterministic D13 preview contract
- `src/core/uno-preview.ts` is a strict **whitelist parser**, not a C++ interpreter or AVR virtual machine. Never use `eval`, `Function`, dynamic imports, browser script injection or execution of arbitrary project code. Cap input size, statement count and delay/cycle duration; reject unsupported loops/conditionals/peripherals and unknown pins.
- Only one Arduino Uno on the active project may enable the D13-only built-in LED preview. Preserve exported `.ino` as user-authored source; preview data (compiled events, time, GPIO state) must remain ephemeral and must NOT be stored in schema-v2 project JSON.
- Time cursor is deterministic, not real-time scheduling. Since alpha.2, external LEDs may change **only** through the separate bounded `analyzeGpioD13` netlist calculation, never by SVG proximity or by altering the normal DC/RC solver modes. Code edits, undo, import and workspace changes invalidate old preview state. Keep explicit unsupported diagnostics in the editor.
- Passing parser tests plus Chromium/Firefox/WebKit browser interactions is necessary before Pages publishing. This is a milestone toward, but not completion of, real Arduino-compatible runtime.

## v0.4.0-alpha.2 D13 wired circuit integration
- External D13/GND LED output is an explicitly scoped **virtual 5V HIGH / 0V LOW source behind a fixed 25Ω output resistor**. This is a teaching assumption, not a calibrated ATmega328P output model. No physical overvoltage, ESD or GPIO damage/fuse effects.
- Source injection in `src/core/gpio-d13.ts` must be ephemeral and non-mutating: transform a **copy** of an otherwise valid schema-v2 project into a synthetic battery/resistor circuit, remapping only the actual Uno `d13` and `gnd` pin endpoints. Never persist synthetic source elements or change user-authored wire terminal IDs.
- Use existing `buildNetlist` and nonlinear `analyzeDC` for resistor and LED current, with explicit opt-in for 0V virtual source under LOW. Reject actual 9V battery mixing, V5 pin use, multiple Uno boards, unsupported connected peripherals, D13/GND direct shorts and disconnected output/ground. Warn above ±20mA modeled drive; overcurrent LED must not glow normally.
- Keep `unoPreview` and normal `isRunning` simulation mutually exclusive. Time-scrubbing updates external LED glow, current measurements and warnings without modifying saved JSON. Editing source or changing project invalidates all preview state.
- Assert HIGH/LOW, reversed/unconnected/shorted/no-limit cases, netlist breadboard topology, source immutability and Chromium/Firefox/WebKit UI behavior before Pages deployment.

## v0.4.0-alpha.3 deterministic virtual Serial monitor
- The strict Arduino whitelist now includes literal-only `Serial.begin`, `Serial.print` and `Serial.println` alongside D13 GPIO and integer delays. Never run eval, C++ compilation, arbitrary expressions or real serial I/O.
- Monitor output is a pure function of source and UI time cursor, not live serial transport. Cap baud rates, literal lengths, event count, visible log rows and elapsed time. Preserve truncation warnings, and export only the currently visible simulated log.
- Serial text is escaped before insertion into HTML and written via textContent on scrub; tests must include HTML-like payloads and reject unsupported expressions.
- Serial-only sketches may omit D13 pinMode; in that case do not inject a virtual GPIO driver. Old sketch/D13 tests must remain valid; UI state must never pollute schema-v2 project JSON.
