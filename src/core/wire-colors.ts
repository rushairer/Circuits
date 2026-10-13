/** Tinkercad Circuits swatches. Historical original's shortcut labels are
 * 1 Black, 2 Red, ... 9 Pink, 0 Brown; Gray/White have no digit shortcut.
 * See docs/ALPHA11.md for reference and authenticated-modern caveat.
 */
export const WIRE_COLOR_PRESETS=[
 {name:'黑色',value:'#252525'},
 {name:'红色',value:'#de4747'},
 {name:'橙色',value:'#f18f33'},
 {name:'黄色',value:'#e4bf35'},
 {name:'绿色',value:'#35b65d'},
 {name:'青绿色',value:'#29b9b3'},
 {name:'蓝色',value:'#3b86d1'},
 {name:'紫色',value:'#9465c3'},
 {name:'粉红色',value:'#df72ad'},
 {name:'棕色',value:'#946344'},
 {name:'灰色',value:'#888e94'},
 {name:'白色',value:'#f6f6f6'}
] as const;
export const DEFAULT_WIRE_COLOR=WIRE_COLOR_PRESETS[4].value;
/** 0 maps to the TENTH swatch, not the first. */
export function wireColorForDigit(digit:string):string|null {
 if(!/^[0-9]$/.test(digit))return null;
 return WIRE_COLOR_PRESETS[digit==='0'?9:Number(digit)-1].value;
}
export function wireColorOptions(selected:string):string {
 return WIRE_COLOR_PRESETS.map(({name,value},i)=>
   '<option value="'+value+'"'+(selected.toLowerCase()===value?' selected':'')+'>'+
   (i<10?((i+1)%10)+' · ':'')+name+'</option>').join('')+
   (WIRE_COLOR_PRESETS.some(v=>v.value===selected.toLowerCase())?'':'<option selected disabled value="">自定义</option>');
}
