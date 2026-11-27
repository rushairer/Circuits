import type { SchematicComponent } from '../core/schematic.js';

interface SymbolArtwork {
 body:string;
 /** One independent lead per real pin, ending at the existing bus anchor. */
 leads:Map<string,string>;
}

/** Original, conventional electrical artwork. Local pin geometry is keyed
 * by model pin ID, never by a guessed polarity or circuit-canvas rotation.
 * The external bus router and Netlist remain unchanged.
 */
export function connectedSchematicSymbol(component:SchematicComponent):SymbolArtwork|null {
 const x=component.x+70;
 const points=new Map(component.terminals.map(t=>[t.pinId,t]));
 const ids=component.kind==='potentiometer'?['a','wiper','b']:
  component.kind==='arduino'?['d13','gnd','v5']:
  component.kind==='servo'?['signal','positive','negative']:
  component.kind==='led'?['anode','cathode']:
  ['battery','buzzer','multimeter','ammeter'].includes(component.kind)?['positive','negative']:
  ['resistor','capacitor','switch','pushbutton'].includes(component.kind)?['a','b']:[];
 if(!ids.length||points.size!==ids.length||ids.some(id=>!points.has(id)))return null;
 const rows=ids.map(id=>points.get(id)!.y);
 if(rows.some((y,i)=>!Number.isFinite(y)||(i>0&&y<=rows[i-1])))return null;
 const top=rows[0],bottom=rows[rows.length-1],mid=(top+bottom)/2;
 const leads=new Map<string,string>();
 const lead=(id:string,startX:number)=>{
  const t=points.get(id)!;
  leads.set(id,'M'+startX+' '+t.y+' H'+t.x);
 };
 const path=(d:string)=>'<path d="'+d+'"/>';
 const circle=(cx:number,cy:number,r:number)=>'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="#fff"/>';
 const label=(tx:number,ty:number,value:string,size=10)=>'<text x="'+tx+'" y="'+ty+'" font-size="'+size+'" text-anchor="middle" fill="#314c5a" stroke="none">'+value+'</text>';
 let art='';
 if(component.kind==='arduino'||component.kind==='servo'){
  const right=x+20,left=x-27;
  art='<rect x="'+left+'" y="'+(top-9)+'" width="47" height="'+(bottom-top+18)+'" rx="2" fill="#fff"/>'+
   label((left+right)/2,mid+3,component.kind==='arduino'?'UNO':'SERVO',8);
  for(const id of ids)lead(id,right);
 }else{
  lead(ids[0],x);lead(ids[ids.length-1],x);
  const normalized=(drawing:string)=>'<g transform="translate('+x+' '+mid+') scale(1 '+((bottom-top)/40)+')">'+drawing+'</g>';
  switch(component.kind){
   case 'resistor':
   case 'potentiometer':
    art=normalized(path('M0 -20 V-14 L-7 -10 L7 -6 L-7 -2 L7 2 L-7 6 L7 10 L0 14 V20'));
    if(component.kind==='potentiometer'){
     // Wiper arrow points at the resistive element; it is not a wire join.
     const wy=rows[1];lead('wiper',x+19);
     art+=path('M'+(x+19)+' '+wy+' H'+(x+5)+' m0 0 l5 -4 m-5 4 l5 4');
    }
    break;
   case 'capacitor':
    art=normalized(path('M0 -20 V-5 M-13 -5 H13 M-13 5 H13 M0 5 V20'));break;
   case 'battery':
    art=normalized(path('M0 -20 V-5 M-15 -5 H15 M-8 5 H8 M0 5 V20'))+
     label(x-23,top+5,'+')+label(x-23,bottom,'−');break;
   case 'led':
    art=normalized(path('M0 -20 V-10 M0 10 V20 M-11 10 H11')+
     '<path d="M-10 -10 H10 L0 10 Z" fill="#fff"/>')+
     path('M'+(x-12)+' '+(mid-2)+' l-9 7 m0 -4 v4 h4 M'+(x-10)+' '+(mid+4)+' l-9 7 m0 -4 v4 h4');break;
   case 'switch':
   case 'pushbutton': {
    const closed=component.kind==='switch'&&component.switchClosed;
    art=normalized(path('M0 -20 V-12 M0 12 V20')+
     circle(0,-9,3)+circle(0,9,3)+
     path(closed?'M0 -6 V6':'M-1 -6 L-12 6')+
     (component.kind==='pushbutton'?path('M-17 -9 V9 M-24 0 H-17'):''));
    break;
   }
   case 'multimeter':
   case 'ammeter':
   case 'buzzer':
    art=path('M'+x+' '+top+' V'+(mid-8)+' M'+x+' '+(mid+8)+' V'+bottom)+circle(x,mid,8)+
     label(x,mid+3,component.kind==='multimeter'?'V':component.kind==='ammeter'?'A':'BZ',component.kind==='buzzer'?7:10);break;
   default:return null;
  }
 }
 return {body:'<g class="sch-symbol" data-symbol-kind="'+component.kind+'" stroke="#314c5a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">'+art+'</g>',leads};
}
