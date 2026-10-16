import type { Part } from '../model.js';
import { RESISTANCE_UNITS,resistorDisplayValue } from '../core/resistance-units.js';

/** Canonical Inspector and contextual popover share the same numeric/unit fields. */
export function resistorValueFields(part:Part,quick=false):string {
 const selected=part.resistanceUnit??'ohm';
 const number=String(resistorDisplayValue(part));
 const numeric=quick?'data-quick-field="value" aria-label="快捷阻值"':'id="value" aria-label="阻值"';
 const unit=quick?'data-quick-field="value-unit" aria-label="快捷电阻单位"':'id="value-unit" aria-label="电阻单位"';
 return '<label class="'+(quick?'quick-field ':'')+'resistance-field">'+
   '<span>阻值</span><span class="resistance-value-row">'+
   '<input type="number" '+numeric+' step="any" min="0.000000000001" value="'+number+'"/>'+
   '<select '+unit+'>'+RESISTANCE_UNITS.map(item=>
    '<option value="'+item.value+'"'+(item.value===selected?' selected':'')+'>'+item.symbol+'</option>'
   ).join('')+'</select></span></label>';
}
