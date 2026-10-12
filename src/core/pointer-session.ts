/** Ephemeral gesture ownership, independent of DOM, world coordinates and circuit JSON. */
export interface PointerSample {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
}
export interface PointerContact extends PointerSample {
  startX: number;
  startY: number;
  dragged: boolean;
}
export type PointerStart = 'start' | 'interrupt' | 'ignore';
export const pointerThreshold = (type: string): number => type === 'touch' ? 8 : 5;

/** A second contact aborts editing; ownership never transfers to a remaining finger. */
export class PointerSession {
  private readonly contacts = new Map<number, PointerContact>();
  private owner: number | null = null;
  get busy(): boolean { return this.contacts.size > 0; }
  owns(id: number): boolean { return this.owner === id; }
  has(id: number): boolean { return this.contacts.has(id); }
  snapshot(): PointerContact[] { return [...this.contacts.values()].map(p => ({...p})); }

  begin(p: PointerSample, onCanvas: boolean): PointerStart {
    if (!Number.isFinite(p.clientX) || !Number.isFinite(p.clientY) ||
        !Number.isInteger(p.pointerId) || this.contacts.has(p.pointerId)) return 'ignore';
    // UI-only contacts must retain native scrolling, selection and form behavior.
    if (!onCanvas && !this.busy) return 'ignore';
    const occupied = this.busy;
    this.contacts.set(p.pointerId, {...p, startX:p.clientX, startY:p.clientY, dragged:false});
    if (occupied) {
      const interrupted = this.owner !== null;
      this.owner = null;
      return interrupted ? 'interrupt' : 'ignore';
    }
    // isPrimary is per input type, so it is not sufficient without owner tracking.
    if (!p.isPrimary) return 'ignore';
    this.owner = p.pointerId;
    return 'start';
  }
  update(p: PointerSample): PointerContact | null {
    const contact = this.contacts.get(p.pointerId);
    if (!contact || !Number.isFinite(p.clientX) || !Number.isFinite(p.clientY)) return null;
    contact.clientX = p.clientX;
    contact.clientY = p.clientY;
    contact.dragged ||= Math.hypot(p.clientX-contact.startX, p.clientY-contact.startY) >
      pointerThreshold(contact.pointerType);
    return {...contact};
  }
  finish(id: number): boolean {
    const owned = this.owns(id);
    this.contacts.delete(id);
    if (owned) this.owner = null;
    return owned;
  }
  /** Escape/capture loss blocks the held contacts until their own up/cancel events. */
  abort(): void { this.owner = null; }
  /** Blur/hidden documents may never receive pointerup; a fresh gesture must recover. */
  reset(): void { this.owner = null; this.contacts.clear(); }
}
