import { labels, parts, type Kind } from '../model.js';
import { exampleCatalog } from './examples.js';

/** UI-only palette filtering. Catalog choice never becomes part of Project. */
export type ComponentCategory='basic'|'all'|'starters-basic'|'starters-arduino';

export const COMPONENT_CATEGORIES=[
 {value:'basic',label:'组件 · 基础'},
 {value:'all',label:'组件 · 全部'},
 {value:'starters-basic',label:'示例 · 基础电路'},
 {value:'starters-arduino',label:'示例 · Arduino'}
] as const satisfies readonly {value:ComponentCategory;label:string}[];

const BASIC_PARTS=new Set<Kind>([
 'resistor','led','pushbutton','potentiometer','capacitor',
 'switch','battery','breadboard','arduino'
]);

const aliases:Record<Kind,readonly string[]>={
 battery:['9v','battery','电源','电池'],
 resistor:['resistor','resistance','ohm'],
 led:['light','diode','发光二极管'],
 breadboard:['breadboard','bread board','插孔','实验板'],
 arduino:['arduino uno','uno r3','微控制器'],
 switch:['slide switch','slideswitch','滑动开关'],
 pushbutton:['button','pushbutton','momentary','按键'],
 potentiometer:['potentiometer','variable resistor','可变电阻'],
 capacitor:['capacitor','cap','电容器'],
 buzzer:['piezo','buzzer','蜂鸣'],
 multimeter:['multimeter','voltmeter','电压表'],
 ammeter:['ammeter','current meter','电流表'],
 servo:['servo','servomotor','舵机']
};

const matches=(term:string,values:readonly string[])=>
 values.some(value=>value.toLocaleLowerCase().includes(term));

export const isComponentCategory=(x:unknown):x is ComponentCategory=>
 COMPONENT_CATEGORIES.some(category=>category.value===x);

export const isStarterCategory=(c:ComponentCategory):boolean=>
 c==='starters-basic'||c==='starters-arduino';

const normalize=(query:string)=>query.trim().toLocaleLowerCase();

/**
 * Official Tinkercad permits searching all supported parts even while its
 * default category is Basic. An active search therefore broadens this small
 * implementation's catalog to All without changing the visible dropdown.
 */
export function matchingComponents(category:ComponentCategory,query:string):Kind[] {
 if(isStarterCategory(category))return [];
 const term=normalize(query);
 return parts.filter(kind=>
   (category==='all'||term.length>0||BASIC_PARTS.has(kind))&&
   (!term||matches(term,[kind,labels[kind],...aliases[kind]]))
 );
}

const ARDUINO_STARTER_IDS=new Set([
 'gpio-d13-led','uno-serial','uno-for-pulse'
]);

/** Project examples are our supported educational Starters, not Autodesk's. */
export function matchingStarters(category:ComponentCategory,query:string){
 if(!isStarterCategory(category))return [];
 const term=normalize(query);
 return exampleCatalog.filter(item=>{
   const arduino=ARDUINO_STARTER_IDS.has(item.id);
   if((category==='starters-arduino')!==arduino)return false;
   return !term||matches(term,[item.id,item.title,item.description,arduino?'arduino uno':'basic']);
 });
}
