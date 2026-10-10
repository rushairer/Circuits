/**
 * Fixed painter's-order contract for the Circuits 2D editor.
 *
 * SVG paints later siblings above earlier siblings. Breadboard bodies must
 * never cover completed wires; exposed sockets remain interactive over wires
 * while plugged-in components and edit handles occupy the foreground.
 *
 * Do not infer electrical contact from SVG visibility or stacking.
 */
export const CIRCUIT_LAYER_ORDER=[
 'substrate',       // breadboard body only
 'wires',           // real conductor strokes + their select hit paths
 'board-sockets',   // small see-through socket targets at real pad centers
 'components',      // components plugged into / floating above the substrate
 'wire-controls',   // selected bend and endpoint drag handles
 'overlays'         // marquee, draft route and transient hover indicators
] as const;

export type CircuitLayer=typeof CIRCUIT_LAYER_ORDER[number];

export function composeCircuitLayers(layers:Record<CircuitLayer,string>):string {
 return CIRCUIT_LAYER_ORDER.map(name=>
   '<g data-layer="'+name+'">'+layers[name]+'</g>').join('');
}
