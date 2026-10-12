import { PointerSession, type PointerContact } from '../core/pointer-session.js';

export type CanvasClick = Pick<MouseEvent,
  'clientX' | 'clientY' | 'timeStamp' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'target'>;
export interface CanvasPointer extends CanvasClick {
  target: Element;
  pointerId: number;
  pointerType: string;
  button: number;
  buttons: number;
  altKey: boolean;
  dragged: boolean;
  preventDefault(): void;
}
type CancelReason = 'multiple' | 'cancel' | 'capture' | 'blur' | 'hidden' | 'command';
interface Hooks {
  down(e: CanvasPointer): void;
  move(e: CanvasPointer): void;
  up(e: CanvasPointer): void;
  tap(e: CanvasClick): void;
  cancel(reason: CancelReason): void;
}

/**
 * Capture on the stable app root, NOT a pin/scene replaced by render(). Real
 * release targets come from coordinates, never the captured event.target.
 * Mouse keeps native click/dblclick; direct-input taps are handled exactly once.
 */
export function bindCanvasPointers(root: HTMLElement, hooks: Hooks) {
  const session = new PointerSession();
  const captures = new Set<number>();
  const clicks = new Map<number, {x:number; y:number; until:number}>();
  const onCanvas = (target: Element) => root.contains(target) && !!target.closest('#board');
  const targetAt = (e: PointerEvent): Element =>
    document.elementFromPoint(e.clientX, e.clientY) ?? root;
  const input = (e: PointerEvent, target: Element, dragged = false): CanvasPointer => ({
    target, dragged, pointerId:e.pointerId, pointerType:e.pointerType,
    button:e.button, buttons:e.buttons, clientX:e.clientX, clientY:e.clientY,
    timeStamp:e.timeStamp, shiftKey:e.shiftKey, ctrlKey:e.ctrlKey,
    metaKey:e.metaKey, altKey:e.altKey, preventDefault:() => e.preventDefault()
  });
  const suppress = (p: Pick<PointerContact,'pointerId'|'clientX'|'clientY'>, now: number) => {
    for (const [id, click] of clicks) if (click.until < now) clicks.delete(id);
    clicks.set(p.pointerId, {x:p.clientX, y:p.clientY, until:now+800});
  };
  const release = (id: number) => {
    captures.delete(id);
    if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
  };
  const interrupt = (reason: CancelReason, reset = false) => {
    for (const p of session.snapshot()) suppress(p, performance.now());
    // Clear ownership before release: the resulting lostpointercapture is expected.
    if (reset) session.reset(); else session.abort();
    for (const id of [...captures]) release(id);
    hooks.cancel(reason);
  };
  const down = (e: PointerEvent) => {
    if (!(e.target instanceof Element)) return;
    // Do not let a pen barrel button or eraser become a left-button canvas edit.
    if (e.button !== 0 && !(e.pointerType === 'mouse' && e.button === 1)) return;
    if (!session.busy) clicks.clear(); // a new real input must not be swallowed
    const result = session.begin(e, onCanvas(e.target));
    if (result === 'interrupt') { e.preventDefault(); interrupt('multiple'); return; }
    if (result !== 'start') {
      if (session.has(e.pointerId)) { e.preventDefault(); suppress(e,e.timeStamp); }
      return;
    }
    if (e.pointerType !== 'mouse') {
      e.preventDefault();
      try { root.setPointerCapture(e.pointerId); captures.add(e.pointerId); }
      catch { /* Synthetic PointerEvents have no native active pointer to capture. */ }
    }
    hooks.down(input(e, e.target));
  };
  const move = (e: PointerEvent) => {
    const contact = session.update(e);
    if (session.busy && !session.owns(e.pointerId)) return;
    if (!session.busy && (e.pointerType === 'touch' || e.buttons !== 0)) return;
    hooks.move(input(e, targetAt(e), contact?.dragged));
  };
  const up = (e: PointerEvent) => {
    if (!session.has(e.pointerId)) {
      // An up after blur/reset cannot become a fresh canvas click, even much later.
      if (e.target instanceof Element && (e.target === root || onCanvas(e.target))) suppress(e,e.timeStamp);
      return;
    }
    const contact = session.update(e);
    const owned = session.owns(e.pointerId);
    const event = input(e, targetAt(e), contact?.dragged);
    if (!owned || event.dragged || e.pointerType !== 'mouse') suppress(e,e.timeStamp);
    // Apply the final sample even if the browser did not deliver a final move.
    if (owned && event.dragged) hooks.move(event);
    session.finish(e.pointerId);
    try {
      if (owned) {
        hooks.up(event);
        if (!event.dragged && e.pointerType !== 'mouse') hooks.tap(event);
      }
    } finally { release(e.pointerId); }
  };
  const cancel = (e: PointerEvent) => {
    if (!session.has(e.pointerId)) return;
    const owned = session.finish(e.pointerId);
    suppress(e,e.timeStamp);
    release(e.pointerId);
    if (owned) hooks.cancel('cancel');
  };
  const lost = (e: PointerEvent) => {
    if (e.target === root && session.owns(e.pointerId)) interrupt('capture');
  };
  const click = (e: MouseEvent) => {
    if (e.detail === 0) return; // keyboard and assistive activation are not pointer taps
    const pointerId = e instanceof PointerEvent ? e.pointerId : null;
    const match = pointerId !== null ? clicks.get(pointerId) : undefined;
    const now = e.timeStamp;
    if ((match && now <= match.until) || [...clicks.values()].some(c =>
      now <= c.until && Math.hypot(e.clientX-c.x,e.clientY-c.y) < 25)) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  };
  const blur = () => interrupt('blur', true);
  const hidden = () => { if (document.hidden) interrupt('hidden', true); };
  const menu = (e: MouseEvent) => {
    if (session.busy && e.target instanceof Element && onCanvas(e.target)) e.preventDefault();
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', lost);
  root.addEventListener('click', click, true);
  root.addEventListener('contextmenu', menu);
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', hidden);
  return {
    get busy() { return session.busy; },
    cancel() { if (session.busy) interrupt('command'); },
    dispose() {
      interrupt('command', true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      root.removeEventListener('lostpointercapture', lost);
      root.removeEventListener('click', click, true);
      root.removeEventListener('contextmenu', menu);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    }
  };
}
