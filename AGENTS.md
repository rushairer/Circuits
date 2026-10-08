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
