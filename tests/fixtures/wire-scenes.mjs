/** Seeded geometry fixtures; no random input, DOM, electrical solver or timing. */
export function wireScene(count, {layout='dense',bends=2,routed=false,seed=11}={}) {
 let state=seed>>>0;
 const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const partCount=Math.min(300,Math.max(2,count*2));
 const parts=Array.from({length:partCount},(_,i)=>{
  const pair=Math.floor(i/2),x=(pair%15)*2000,y=Math.floor(pair/15)*2000;
  return {id:'p'+i,kind:'resistor',x:layout==='sparse'?x+(i%2)*800:Math.floor(next()*1000),
   y:layout==='sparse'?y+(i%2)*120:Math.floor(next()*800),rotation:0,value:330};
 });
 const wires=Array.from({length:count},(_,i)=>{
  const from=i*2%partCount,to=(from+1)%partCount,a=parts[from];
  const points=Array.from({length:bends},(_,j)=>layout==='sparse'?
   {x:a.x+300+j*50,y:a.y+30+j*90}:
   {x:Math.floor(next()*1200)-100,y:Math.floor(next()*1000)-100});
  return {id:'wire-'+i,from:{componentId:'p'+from,pinId:'a'},
   to:{componentId:'p'+to,pinId:'b'},color:i%2?'#e45454':'#35b65d',
   ...(points.length?{bends:points}:{}),
   ...(routed?{routing:i%2?'vertical':'horizontal'}:{})};
 });
 return {schemaVersion:2,name:'Wire benchmark',parts,wires,code:''};
}
export const wireBenchmarkCases=[
 {name:'small',count:12,options:{layout:'sparse'}},
 {name:'sparse-600-segments',count:200,options:{layout:'sparse'}},
 {name:'dense-720-segments',count:240,options:{layout:'dense'}},
 {name:'large-2000-wires',count:2000,options:{layout:'dense'}},
 {name:'max-waypoints',count:2000,options:{layout:'dense',bends:32,routed:true}}
];

/** Covers both sides of the index threshold and the 720-segment visual cap. */
export const wireReferenceCases=[...wireBenchmarkCases,
 {name:'empty',count:0,options:{}},
 {name:'scan-255-segments',count:85,options:{layout:'sparse'}},
 {name:'index-258-segments',count:86,options:{layout:'sparse'}},
 {name:'budget-723-segments',count:241,options:{}},
 {name:'mixed-orthogonal',count:90,options:{routed:true,seed:97}},
 {name:'reversed-order',count:180,options:{seed:31},reverse:true},
 {name:'retarget-from',count:120,options:{seed:43},preview:{id:'wire-100',side:'from',point:{x:-150,y:200}}},
 {name:'retarget-to',count:120,options:{seed:59},preview:{id:'wire-100',side:'to',point:{x:1400,y:-200}}},
 {name:'minimum-radius',count:120,options:{seed:67},radius:2},
 {name:'maximum-radius',count:120,options:{seed:83},radius:12},
 {name:'legacy-auto',count:200,options:{bends:0,seed:101}},
 {name:'routed-auto',count:200,options:{bends:0,routed:true,seed:103}}
];
