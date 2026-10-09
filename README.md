# Circuits

[简体中文](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

Circuits is an **independent, open-source browser circuit workbench** written in TypeScript + Vite. Its long-term goal is functional parity with Tinkercad Circuits, not reproduction of Autodesk's proprietary code, branding, or artwork.

> **v0.4.0-alpha.4 — experimental prototype.** This is **not** a complete Tinkercad Circuits replica, SPICE simulator, or functioning Arduino emulator.

## Implemented

- SVG editor with a 13-kind component palette: battery, resistor, LED, breadboard, Arduino Uno, switch, pushbutton, potentiometer, capacitor, buzzer, multimeter, series ammeter, servo
- Add, drag, rotate, select, Shift-select, marquee-select, group-move, batch-rotate/delete and wire components by pin; wire selection, color editing and deletion
- Undo/redo, multi-project browser library, duplicate/open/delete projects, versioned JSON import/export, zoom, grid snapping, editable wire bends, drag-to-reconnect wire endpoints, resistor/LED breadboard lead insertion with auto-snap, and Arduino text editor with a strictly limited deterministic D13 Blink preview
- Breadboard connectivity: five-hole strips, separated sides, independent power rails split into two segments
- Experimental DC modified nodal analysis for **one battery + one LED** with resistor networks (including parallel paths), plus a toggleable ideal two-terminal switch
- Import schema validation and Node unit tests

**Simulation limitations:** a fixed 2 V LED forward drop is a teaching approximation; other depicted parts do not have runnable electrical models. There is no microcontroller code execution, SPICE/transient simulation, oscilloscope or real multimeter simulation. Unsupported wired parts are not silently treated as real simulations.

## Development

Requires Node.js 22.12+.

```sh
npm install
npm run typecheck
npm test
npm run test:e2e # requires: npx playwright install --with-deps chromium firefox webkit
npm run build
npm run dev
```

## CI and GitHub Pages

Pushes to `main` run `.github/workflows/ci.yml` (TypeScript, tests, production build), and always preserve a successful `circuits-dist` build artifact.

**One-time setup:** repository administrator must visit [Settings → Pages](https://github.com/rushairer/Circuits/settings/pages) and choose **GitHub Actions** as the build and deployment source. Until then, CI can be green but the Pages deployment is explicitly skipped. Once enabled, the workflow also performs an HTTP smoke test against the published site after deployment. Trigger **Run workflow** in [Actions](https://github.com/rushairer/Circuits/actions/workflows/ci.yml) or push another commit.

Expected URL **only after a successful deployment**: https://rushairer.github.io/Circuits/.

## Scope and licensing

See [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), and [AGENTS.md](AGENTS.md). This independent project is not affiliated with Autodesk or Tinkercad. Original project code is MIT licensed.

### Keyboard operation

Tab focuses components; Enter/Space selects a focused component (Shift adds/removes). Ctrl/Cmd+A selects all components. Arrow keys nudge the selected set, Alt+Arrow nudges by one world unit, Delete removes selected parts, and Ctrl/Cmd+Z undoes one batch.

CI runs the browser suite in Chromium, Firefox and Playwright's WebKit on Linux. The WebKit engine check is useful but does not replace native Safari QA on macOS/iOS.

### Canvas navigation

Mouse wheel zooms around the pointer. Hold Space while left-dragging, or use middle-mouse drag, to pan. Toolbar +/− zoom around the visible canvas center; Reset restores only the camera.

### Experimental nonlinear DC model (opt-in)

Toggle **模型：固定 2V** to **模型：非线性 DC（实验）**, then start simulation. This mode supports one DC source, resistor networks, multiple LED branches, ideal switches and ideal high-Z voltage sensing alongside finite-shunt in-series current measurement. The UI displays per-LED current and signed meter volts, or an explicit unsupported/unconnected message.

The red LED curve is an intentionally simplified exponential approximation near 2 V at 20 mA. Overcurrent numbers, thermal performance, breakdown and device tolerances are *not* physically predictive. The default fixed 2V mode is retained for legacy projects.

Use **示例电路** in the toolbar to create separate, non-destructive example projects: a baseline LED, two LEDs in parallel, two LEDs in series or a 9V voltmeter. These choose experimental nonlinear DC mode for convenient inspection.

### Release provenance

The production HTML embeds `circuits-revision=<git SHA>`. CI verifies the exact current commit over public HTTPS after Pages deployment, with cache-busting and bounded retries. A successful workflow therefore means the expected version—not merely an older page title—was reachable.

### RC charging/discharging (experimental)

Use **示例电路** to open RC charging (9V, 1kΩ, 100µF) or source-free discharge (9V capacitor initial condition, 1kΩ). Each creates a separate project and selects **模型：RC 暂态（实验）**. Start simulation for the voltage trace; move the time slider to inspect 101 deterministic samples from 0 to 5 time constants. Capacitor inspector accepts capacitance in µF and initial signed voltage in V.

The solver handles **one ideal capacitor**, linear resistors, static ideal switches, breadboard connections, and zero or one DC battery. It calculates Rth and V∞ from actual connected pin networks, not the pixel drawing. Multiple capacitors/inductors, time-varying switches, LED nonlinear transients and oscilloscopes are not implemented; those circuits return unsupported diagnostics.

### Multiple capacitor RC numerical analysis

Two new starter examples compare 100µF/200µF **parallel** capacitors and two 100µF **series** capacitors, charged by a 9V source through 1kΩ. The existing RC toolbar mode automatically chooses the analytical model for one capacitor or a bounded backward-Euler linear network model for 2–6 capacitors. Start simulation, choose a capacitor trace, select a 0.1–10 second display window and scrub its 101 voltage/current readings. All 12 examples create separate local projects.

The numerical model excludes inductors, nonlinear devices, live switch events and multiple independent voltage sources. It detects incompatible initial charges and hard source/connection conflicts; the first sampled current is intentionally unavailable, rather than fabricated as 0 mA. This waveform viewer is not a physical oscilloscope.

### Virtual oscilloscope and RC voltage probing

In RC mode, start the simulation and open **▤ 示波器** for a separate two-channel waveform viewer: CH1 simulated capacitor voltage (V) and CH2 the computed capacitor branch current (mA), each with its own axis. Change capacitor, scrub the time cursor, and export all simulated capacitor traces as CSV with explicit column units. Multi-capacitor t=0 current is blank rather than silently shown as zero. This is **not** an actual oscilloscope or an Arduino execution environment.

An existing wired multimeter shows signed RC sample voltage **within the same connected modeled RC island**, including resistor nodes, series capacitors and reversed leads. Disconnected floating islands, inconsistent constraints and unsupported circuits show `----` with an explicit reason. Physical in-series current measurement and hardware oscilloscope simulation remain future work.

### RC resistor-node measurements and numerical convergence

The RC voltmeter now measures signed drops **across resistors and other resistor-network nodes** as well as capacitor paths. Its virtual high-impedance probes use sampled capacitor voltages, the ideal battery and passive resistor KCL (actual connected terminal IDs). Disconnected floating islands and inconsistent voltage constraints remain unavailable rather than being treated as zero.

There are now **12 starter examples**, including **RC 电阻压降测量**: a 9V RC charging circuit with the meter across 1kΩ, falling from 9V to about 3.31V at one time constant. In the multi-capacitor numerical RC panel, choose **检查数值一致性** to compare a standard backward-Euler trace with a halved internal step; the display warns if the first output interval hides most of a fast transient. The comparison is **not an independent physical accuracy guarantee or SPICE calibration**.

### Series ammeter and static switch contact resistance (v0.3.0-alpha.7)

Use the new **串联电流表** to place a fixed 0.1-ohm shunt *in series*, connecting both terminals. Experimental nonlinear DC and linear RC modes report signed milliampere values; an unconnected lead is not a valid 0mA reading. Beyond +/-200mA the display reports OL (educational overrange, without physical fuse simulation). The classic fixed-2V mode does not calculate this instrument.

The toggle switch has optional closed-contact resistance: 0 ohms (original ideal default) or 0.1-1,000,000 ohms. Open means nonconductive. Toggling re-solves from the specified RC initial state at t=0: no mid-trace switching is simulated. New independent projects include **LED 串联电流表**, **RC 串联电流测量**, and **RC 有损接触开关**. Reference fixtures compare first-order RC time constants and multi-capacitor numerical results with the ammeter's real shunt burden and contact resistance included.

### Arduino Uno D13 restricted Blink preview (v0.4.0-alpha.1)

Open **〈/〉 代码**, keep exactly one Arduino Uno on the canvas, and click **▶ 解析并预览 D13**. The original default Blink sketch generates a **deterministic 2000ms D13 HIGH/LOW timeline**; scrub 0–5000ms to update the Uno's built-in LED indicator. This is purely a statically interpreted subset: `void setup()`, `void loop()`, `pinMode(13, OUTPUT)`, `digitalWrite(13, HIGH/LOW)` and bounded integer `delay(ms)`, including `LED_BUILTIN` or a simple integer pin alias. Unsafe/unsupported C++ is explicitly rejected; no `eval`, arbitrary code execution, AVR compilation or real-time clock scheduling takes place; external LED topology support is separately scoped below. Code editing and project/workspace changes invalidate stale previews. All `.ino` export and existing circuit solvers remain separate.

### D13 drives external resistor + LED circuits (v0.4.0-alpha.2)

Use the **Arduino D13 外接 LED 闪烁** example. It opens the code panel with an Uno, a 330-ohm resistor and a correctly oriented LED wired from D13 to GND. Click **解析并预览 D13** and scrub time: the external LED lights at HIGH and turns off at LOW. LED current and polarity are calculated from **actual pin, wire and breadboard-net connections**, not SVG distance or simulated timers. A separate virtual output-stage model uses **5V HIGH / 0V LOW behind 25Ω** plus the existing experimental exponential LED and resistor models. The driver warns above **±20mA**; too much LED current is marked overcurrent, never treated as a healthy glow. Unsupported mixing with an independent battery, 5V rail, other active peripherals, disconnected D13/GND, or a direct D13/GND short receives explicit diagnostics. Neither the synthetic source nor sampled output is persisted in the user's project.

This is still **not** AVR/Arduino C++ execution, verified MCU output impedance, live timer scheduling, PWM, ADC or arbitrary GPIO. Ordinary DC/RC analysis remains independent; the sketch preview is selected explicitly from the code editor.


### Arduino virtual Serial monitor (v0.4.0-alpha.3)

Use the new **Arduino 虚拟串口日志** example and select **解析并预览 Arduino**. The static parser supports `Serial.begin(9600)`, literal-only `Serial.print("text")`, `Serial.println("text")` and bounded integer constants. Drag the 0–5000ms preview cursor to see simulated setup/loop output, which has a bounded retained history and can be exported as TXT. Serial-only sketches show D13 as unconfigured; mixed D13/Serial examples still drive the wired LED through the explicit circuit model. No real serial connection, C++ execution, interrupts, variable expressions, Serial.read, timing hardware or arbitrary GPIO is implemented. There are 14 independent example projects.

### Static bounded Arduino for loops (v0.4.0-alpha.4)

Open **Arduino D13 有界循环脉冲** to sample a repeated three-pulse D13 and virtual Serial timeline. The whitelist parser accepts only literal-bound `for(int i=0; i<N; i++) { ... }` loops (N from 0 to 16), with pre-existing supported statements in the body. It expands at most 128 total operations. Nested or dynamic loops, conditionals, variable expressions and actual AVR/C++ execution remain unsupported. Preview history is not persisted in JSON. **15 examples** are available.
