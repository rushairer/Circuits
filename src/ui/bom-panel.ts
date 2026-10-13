import type { BomReport } from '../core/bom.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]!));

/** Read-only generated BOM dialog. All text is rendered as escaped HTML.
 * Rows are grounded in the original project component identities.
 */
export function renderBomPanel(bom:BomReport):string {
 const rows=bom.rows.map((item,index)=>
   '<tr><td>'+(index+1)+'</td>'+
   '<td>'+escape(item.label)+'</td>'+
   '<td>'+escape(item.specification)+'</td>'+
   '<td class="bom-quantity">'+item.quantity+'</td>'+
   '<td>'+escape(item.ids.join('、'))+'</td></tr>'
 ).join('');
 return '<div class="bom-shade" data-action="bom-close"></div>'+
   '<section class="bom-dialog" role="dialog" aria-modal="true" aria-labelledby="bom-title">'+
   '<div class="bom-heading"><div><h2 id="bom-title">物料清单 · BOM</h2>'+
   '<p>'+escape(bom.title)+' · 从当前设计自动生成，不改变电路连接</p></div>'+
   '<button data-action="bom-close" aria-label="关闭物料清单">× 关闭</button></div>'+
   '<div class="bom-overview"><span>组件 <strong>'+bom.totalComponents+'</strong></span>'+
   '<span>不同规格 <strong>'+bom.rows.length+'</strong></span>'+
   '<span>导线 <strong>'+bom.totalWires+'</strong></span>'+
   '<span>注释 <strong>'+bom.totalAnnotations+'</strong></span></div>'+
   '<div class="bom-table-scroller"><table class="bom-table">'+
   '<thead><tr><th scope="col">#</th><th scope="col">组件</th>'+
   '<th scope="col">规格</th><th scope="col">数量</th>'+
   '<th scope="col">组件 ID</th></tr></thead><tbody>'+
   (rows||'<tr><td colspan="5" class="bom-empty">当前电路没有元件；添加元件后将自动汇总。</td></tr>')+
   '</tbody></table></div>'+
   '<p class="bom-disclaimer">仅统计当前工程实际存在的元件。不包含采购价格、焊材或真实制造耗材；当前未模拟的组件仍会如实计数。</p>'+
   '<div class="bom-actions"><button data-action="bom-close">返回工作台</button>'+
   '<button data-action="bom-export">导出 CSV</button></div></section>';
}
