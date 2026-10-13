import type { CircuitNote } from '../model.js';
import { NOTE_WIDTH, NOTE_HEIGHT } from '../core/notes.js';

const xml=(value:string)=>value.replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]!));

/**
 * Render a bounded, selectable visual annotation above circuit components.
 * Only literal text goes into SVG, never foreignObject/HTML or executable markup.
 * The saved full text remains unchanged when the preview wraps/truncates.
 */
export function notePreviewLines(text:string,columns=26,maxLines=4):string[] {
 const rows:string[]=[];
 const tokens=text.replace(/\r/g,'').split('\n');
 for(const token of tokens){
   const graphemes=Array.from(token);
   if(!graphemes.length)rows.push('');
   else for(let i=0;i<graphemes.length;i+=columns)rows.push(graphemes.slice(i,i+columns).join(''));
 }
 const bounded=rows.slice(0,maxLines);
 if(rows.length>maxLines&&bounded.length){
   bounded[bounded.length-1]=Array.from(bounded[bounded.length-1]).slice(0,columns-1).join('')+'…';
 }
 return bounded;
}

export function renderCircuitNotes(notes:readonly CircuitNote[],selectedId:string|null):string {
 if(!notes.length)return '';
 return '<g id="circuit-notes" data-layer="annotations">'+notes.map(note=>{
   const rows=notePreviewLines(note.text);
   const lines=rows.map((line,index)=>
     '<tspan x="12" dy="'+(index===0?0:18)+'">'+xml(line)+'</tspan>').join('');
   const selected=selectedId===note.id;
   return '<g class="circuit-note'+(selected?' selected':'')+'" data-note="'+xml(note.id)+
     '" transform="translate('+note.x+' '+note.y+')" role="button" tabindex="0" aria-pressed="'+
     selected+'" aria-label="注释：'+xml(note.text.slice(0,70)||'空白')+'">'+
     '<rect class="circuit-note-body" x="0" y="0" width="'+NOTE_WIDTH+
     '" height="'+NOTE_HEIGHT+'" rx="7"/>'+
     '<text class="circuit-note-text" x="12" y="25" pointer-events="none">'+
       (lines||'<tspan x="12" dy="0">（空注释）</tspan>')+'</text>'+
     '<title>'+xml(note.text)+'</title></g>';
 }).join('')+'</g>';
}
