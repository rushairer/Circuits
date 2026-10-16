import type { Part } from '../model.js';
import { RESISTANCE_UNITS, resistorDisplayValue } from '../core/resistance-units.js';
import { resistorBands } from '../core/resistor-bands.js';

/** Original SVG-only physical resistor: real pins continue at (0,30) and (140,30). */
export function resistorArtwork(part:Part):string {
 const bands=resistorBands(part.value??220);
 const positions=bands?.length===4?[52,65,78,93]:[47,57,67,78,93];
 const stripes=bands?bands.map((band,i)=>
  '<rect class="resistor-band" data-band-index="'+i+'" data-band-color="'+band.name+
  '" x="'+positions[i]+'" y="14" width="'+(i===bands.length-1?7:6)+'" height="33" fill="'+band.fill+'"/>'
 ).join(''):'';
 const unit=RESISTANCE_UNITS.find(u=>u.value===(part.resistanceUnit??'ohm'))!.symbol;
 const caption=resistorDisplayValue(part)+unit;
 return '<g class="resistor-body" data-resistor-bands="'+(bands?.length??0)+'">'+
   '<path d="M0 30H140" stroke="#b7a17d" stroke-width="5"/>'+
   '<rect x="36" y="13" width="68" height="35" rx="16" fill="#d7b68c" stroke="#bc936c"/>'+
   stripes+
   '<text x="70" y="9" font-size="13" text-anchor="middle" fill="#667988">'+caption+'</text>'+
   (bands?'':'<title>此值无法用四或五色环精确表示，按数字标签显示真实阻值</title>')+
   '</g>';
}
