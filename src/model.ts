export type Kind = 'battery' | 'resistor' | 'led' | 'breadboard' | 'arduino' | 'switch' | 'pushbutton' | 'potentiometer' | 'capacitor' | 'buzzer' | 'multimeter' | 'ammeter' | 'servo';
export interface Part { id:string; kind:Kind; x:number; y:number; value?:number; initialVolts?:number; closed?:boolean; contactOhms?:number; rotation:number }
export interface Endpoint { componentId:string; pinId:string }
export interface Wire { id:string; from:Endpoint; to:Endpoint; color:string; bends?:{x:number;y:number}[] }
export interface Insertion { componentId:string; pinId:string; boardId:string; holeId:string }
export interface Project { schemaVersion?:2; name:string; parts:Part[]; wires:Wire[]; code:string; insertions?:Insertion[] }
export const parts:Kind[] = ['battery','resistor','led','breadboard','arduino','switch','pushbutton','potentiometer','capacitor','buzzer','multimeter','ammeter','servo'];
export const size:Record<Kind,[number,number]>={battery:[92,135],resistor:[140,60],led:[110,100],breadboard:[440,210],arduino:[205,175],switch:[140,90],pushbutton:[110,110],potentiometer:[120,115],capacitor:[95,105],buzzer:[110,110],multimeter:[145,160],ammeter:[145,160],servo:[150,120]};
export const labels:Record<Kind,string>={battery:'9V 电池',resistor:'电阻',led:'LED',breadboard:'面包板',arduino:'Arduino Uno',switch:'拨动开关',pushbutton:'按钮开关',potentiometer:'电位器',capacitor:'电容',buzzer:'蜂鸣器',multimeter:'万用表',ammeter:'串联电流表',servo:'伺服电机'};
const breadboardPins:Record<string,[number,number]>={plus:[30,26],minus:[30,178]};
for(let column=0;column<22;column++){
  const x=28+column*18;
  for(const [name,y] of [['top-plus',26],['top-minus',48],['bottom-plus',165],['bottom-minus',187]] as const){
    breadboardPins[`${name}-${column}`]=[x,y];
  }
  for(let row=0;row<10;row++){
    breadboardPins[`hole-${'abcdefghij'[row]}-${column}`]=[x,67+row*9];
  }
}
export const pins:Record<Kind,Record<string,[number,number]>>={
  battery:{positive:[90,38],negative:[90,100]},resistor:{a:[0,30],b:[140,30]},led:{anode:[0,65],cathode:[110,65]},
  breadboard:breadboardPins,arduino:{d13:[166,8],gnd:[70,165],v5:[105,165]},
  switch:{a:[0,55],b:[140,55]},pushbutton:{a:[0,65],b:[110,65]},
  potentiometer:{a:[0,90],wiper:[60,108],b:[120,90]},
  capacitor:{a:[0,79],b:[95,79]},buzzer:{positive:[0,90],negative:[110,90]},
  multimeter:{positive:[45,158],negative:[104,158]},ammeter:{positive:[45,158],negative:[104,158]},servo:{signal:[0,75],positive:[0,95],negative:[0,115]}
};
export function demo():Project{return {schemaVersion:2,name:'我的第一个电路',parts:[
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
/** Import validation keeps attacker-controlled JSON away from SVG template generation. */
export function validProject(v:unknown):v is Project {
 if(!v||typeof v!=='object')return false;
 const p=v as Partial<Project>;
 if(p.schemaVersion!==undefined&&p.schemaVersion!==2)return false;
 if(!(typeof p.name==='string'&&p.name.length<=120&&typeof p.code==='string'&&p.code.length<=300000&&Array.isArray(p.parts)&&p.parts.length<=300&&Array.isArray(p.wires)&&p.wires.length<=2000))return false;
 const ids=new Set<string>();
 for(const c of p.parts){
   if(!c||typeof c.id!=='string'||!/^[\w-]{1,80}$/.test(c.id)||ids.has(c.id)||!parts.includes(c.kind)||!Number.isFinite(c.x)||!Number.isFinite(c.y)||!Number.isFinite(c.rotation)||Math.abs(c.x)>100000||Math.abs(c.y)>100000||(c.closed!==undefined&&typeof c.closed!=='boolean')||(c.contactOhms!==undefined&&(c.kind!=='switch'||!Number.isFinite(c.contactOhms)||c.contactOhms<0||c.contactOhms>1e6||(c.contactOhms>0&&c.contactOhms<0.1)))||(c.kind==='ammeter'&&c.value!==undefined)||(c.initialVolts!==undefined&&(c.kind!=='capacitor'||!Number.isFinite(c.initialVolts)||Math.abs(c.initialVolts)>1000))||c.value!==undefined&&(!Number.isFinite(c.value)||Math.abs(c.value)>1e12))return false;
   ids.add(c.id);
 }
 if(p.insertions!==undefined){
   if(!Array.isArray(p.insertions)||p.insertions.length>600)return false;
   const used=new Set<string>();
   for(const insertion of p.insertions){
     if(!insertion||typeof insertion.componentId!=='string'||typeof insertion.pinId!=='string'||
       typeof insertion.boardId!=='string'||typeof insertion.holeId!=='string')return false;
     const owner=p.parts.find(c=>c.id===insertion.componentId);
     const board=p.parts.find(c=>c.id===insertion.boardId);
     const key=insertion.componentId+'::'+insertion.pinId;
     if(!owner||!['resistor','led'].includes(owner.kind)||!Object.hasOwn(pins[owner.kind],insertion.pinId)||
       !board||board.kind!=='breadboard'||!Object.hasOwn(pins.breadboard,insertion.holeId)||
       insertion.holeId==='plus'||insertion.holeId==='minus'||used.has(key))return false;
     used.add(key);
   }
 }
 const wireIds=new Set<string>();
 for(const w of p.wires){
   if(!w||typeof w.id!=='string'||!/^[\w-]{1,80}$/.test(w.id)||wireIds.has(w.id)||!w.from||!w.to||!/^#[0-9a-fA-F]{6}$/.test(w.color))return false;
   if(w.bends!==undefined&&(!Array.isArray(w.bends)||w.bends.length>32||w.bends.some(b=>!b||!Number.isFinite(b.x)||!Number.isFinite(b.y)||Math.abs(b.x)>100000||Math.abs(b.y)>100000)))return false;
   const from=p.parts.find(c=>c.id===w.from.componentId),to=p.parts.find(c=>c.id===w.to.componentId);
   if(!from||!to||!Object.hasOwn(pins[from.kind],w.from.pinId)||!Object.hasOwn(pins[to.kind],w.to.pinId)||w.from.componentId===w.to.componentId&&w.from.pinId===w.to.pinId)return false;
   wireIds.add(w.id);
 }
 return true;
}

export function blankProject():Project{return {schemaVersion:2,name:'未命名电路',parts:[],wires:[],code:demo().code}}
