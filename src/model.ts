export type Kind = 'battery' | 'resistor' | 'led' | 'breadboard' | 'arduino';
export interface Part { id:string; kind:Kind; x:number; y:number; value?:number; rotation:number }
export interface Endpoint { componentId:string; pinId:string }
export interface Wire { id:string; from:Endpoint; to:Endpoint; color:string }
export interface Project { name:string; parts:Part[]; wires:Wire[]; code:string }
export const parts:Kind[] = ['battery','resistor','led','breadboard','arduino'];
export const size:Record<Kind,[number,number]>={battery:[92,135],resistor:[140,60],led:[110,100],breadboard:[440,210],arduino:[205,175]};
export const labels:Record<Kind,string>={battery:'9V 电池',resistor:'电阻',led:'LED',breadboard:'面包板',arduino:'Arduino Uno'};
export const pins:Record<Kind,Record<string,[number,number]>>={
 battery:{positive:[90,38],negative:[90,100]},resistor:{a:[0,30],b:[140,30]},led:{anode:[0,65],cathode:[110,65]},
 breadboard:{'plus':[30,26],'minus':[30,178]},arduino:{d13:[166,8],gnd:[70,165],v5:[105,165]}
};
export function demo():Project{return {name:'我的第一个电路',parts:[
 {id:'b1',kind:'battery',x:100,y:170,rotation:0,value:9},
 {id:'r1',kind:'resistor',x:430,y:215,rotation:0,value:330},
 {id:'l1',kind:'led',x:750,y:170,rotation:0},
 {id:'a1',kind:'arduino',x:100,y:470,rotation:0},
 {id:'bb1',kind:'breadboard',x:480,y:470,rotation:0}
],wires:[
 {id:'w1',from:{componentId:'b1',pinId:'positive'},to:{componentId:'r1',pinId:'a'},color:'#e45454'},
 {id:'w2',from:{componentId:'r1',pinId:'b'},to:{componentId:'l1',pinId:'anode'},color:'#e45454'},
 {id:'w3',from:{componentId:'l1',pinId:'cathode'},to:{componentId:'b1',pinId:'negative'},color:'#273748'}
],code:'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(1000); digitalWrite(13, LOW); delay(1000); }'} }
export function validProject(v:unknown):v is Project {
 if(!v||typeof v!=='object')return false;
 const p=v as Partial<Project>;
 return typeof p.name==='string'&&p.name.length<120&&typeof p.code==='string'&&p.code.length<300000&&Array.isArray(p.parts)&&p.parts.length<301&&Array.isArray(p.wires)&&p.wires.length<2001&&p.parts.every(c=>c&&typeof c.id==='string'&&parts.includes(c.kind)&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.rotation))&&p.wires.every(w=>w&&typeof w.id==='string'&&w.from&&w.to&&typeof w.from.componentId==='string'&&typeof w.to.componentId==='string'&&/^#[0-9a-fA-F]{6}$/.test(w.color));
}
