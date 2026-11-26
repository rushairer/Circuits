/** Conservative viewport culling for generated M/L wire centerlines only.
 * Unknown or malformed geometry remains visible. Bounds include the entire
 * route, not just the electrical endpoints (a bend may enter the viewport).
 */
export interface WireBounds {left:number;top:number;right:number;bottom:number}
export const WIRE_CULL_THRESHOLD=1000;
export const WIRE_CULL_MARGIN_CSS=40;
const numberToken=/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function linearPathBounds(path:string):WireBounds|null{
 if(!path.startsWith('M'))return null;
 const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
 const points=path.slice(1).split(' L');
 if(points.length<2)return null;
 for(const point of points){
  const pair=point.split(' ');
  if(pair.length!==2||!pair.every(value=>numberToken.test(value)))return null;
  const [x,y]=pair.map(Number);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);
  bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);
 }
 return bounds;
}

/** Actual SVG CSS viewport, including meet-letterboxing, projected to world
 * space. Refuse non-axis-aligned transforms instead of hiding uncertain art.
 */
export function wireViewportBounds(rect:WireBounds,
 matrix:{a:number;b:number;c:number;d:number;e:number;f:number}):WireBounds|null{
 const {a,b,c,d,e,f}=matrix;
 if(![rect.left,rect.top,rect.right,rect.bottom,a,b,c,d,e,f].every(Number.isFinite)||
    rect.right<=rect.left||rect.bottom<=rect.top||a<=0||d<=0||b!==0||c!==0)return null;
 const margin=WIRE_CULL_MARGIN_CSS;
 const bounds={left:(rect.left-margin-e)/a,right:(rect.right+margin-e)/a,
  top:(rect.top-margin-f)/d,bottom:(rect.bottom+margin-f)/d};
 return Object.values(bounds).every(Number.isFinite)?bounds:null;
}

export function outsideWireViewport(bounds:WireBounds|null,viewport:WireBounds|null):boolean{
 return !!bounds&&!!viewport&&(bounds.right<viewport.left||bounds.left>viewport.right||
  bounds.bottom<viewport.top||bounds.top>viewport.bottom);
}
