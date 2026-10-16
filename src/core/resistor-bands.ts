/**
 * IEC 60062 digit, multiplier and tolerance colors.
 * Only exact 2- or 3-significant-digit values get painted; unsupported
 * arbitrary values keep an unlabeled body instead of deceptive color bands.
 * Nominal bands are visual, NOT a tolerance simulation.
 */
export interface ResistorBand {name:string;fill:string}
const digits:ResistorBand[]=[
 {name:'black',fill:'#292929'}, {name:'brown',fill:'#874823'},
 {name:'red',fill:'#d3443c'}, {name:'orange',fill:'#e58e27'},
 {name:'yellow',fill:'#f2d447'}, {name:'green',fill:'#38985a'},
 {name:'blue',fill:'#3e83c3'}, {name:'violet',fill:'#7854a9'},
 {name:'grey',fill:'#92989e'}, {name:'white',fill:'#f7f3e5'}
];
const gold:ResistorBand={name:'gold',fill:'#c9a54b'};
const silver:ResistorBand={name:'silver',fill:'#c0c6ca'};
const pink:ResistorBand={name:'pink',fill:'#df8e9d'};
const exponentBand=(exp:number):ResistorBand|null=>
 exp===-3?pink:exp===-2?silver:exp===-1?gold:
 exp>=0&&exp<=9?digits[exp]:null;

/** Four-band (2 digits, ±5%) preferred; 5-band (3 digits, ±1%) otherwise. */
export function resistorBands(ohms:number):readonly ResistorBand[]|null {
 if(!Number.isFinite(ohms)||ohms<=0)return null;
 for(const precision of [2,3]){
  let exponent=Math.floor(Math.log10(ohms))-precision+1;
  if(exponent< -3||exponent>9)continue;
  const factor=Math.pow(10,exponent);
  let numerator=Math.round(ohms/factor);
  if(numerator===Math.pow(10,precision)){
   exponent+=1;numerator=Math.pow(10,precision-1);
  }
  const multiplier=exponentBand(exponent);
  if(!multiplier||numerator<Math.pow(10,precision-1)||numerator>=Math.pow(10,precision))continue;
  const representable=numerator*Math.pow(10,exponent);
  if(Math.abs(ohms-representable)>Math.max(1e-16,Math.abs(ohms)*1e-9))continue;
  const sig=String(numerator).split('').map(ch=>digits[Number(ch)]);
  return [...sig,multiplier,precision===2?gold:digits[1]];
 }
 return null;
}
