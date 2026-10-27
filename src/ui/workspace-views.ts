/** Three view selectors share the existing editor shell and never persist in Project. */
export type WorkspaceView='circuit'|'schematic'|'bom';
const views:readonly {id:WorkspaceView;label:string;hint:string}[]=[
 {id:'circuit',label:'电路',hint:'可编辑电路工作台'},
 {id:'schematic',label:'原理图',hint:'只读自动电气原理图'},
 {id:'bom',label:'组件清单',hint:'只读物料清单'}
];
export function renderWorkspaceTabs(active:WorkspaceView):string {
 return '<nav class="workspace-tabs" role="tablist" aria-label="工作区视图">'+
   views.map(view=>'<button type="button" role="tab" id="tab-'+view.id+'" '+
    'data-action="view-'+view.id+'" aria-controls="workspace-main" title="'+view.hint+'" '+
    'aria-selected="'+(active===view.id)+'" tabindex="'+(active===view.id?'0':'-1')+'">'+
     view.label+'</button>').join('')+'</nav>';
}
/** Intentionally no writable inspector controls outside the electrical workbench. */
export function renderReadonlyInspector(view:Exclude<WorkspaceView,'circuit'>):string {
 return '<div class="readonly-inspector"><h2>'+
   (view==='schematic'?'原理图说明':'组件清单说明')+'</h2>'+
   '<p>'+(view==='schematic'?
    '相同的 N 编号代表真实电气网络，图形交叉不会自动产生连接。电路只在“电路”视图编辑。':
    '当前组件与规格由已有电路数据自动汇总。这里不会修改元件、导线或仿真状态。')+'</p>'+
   '<button type="button" data-action="view-circuit">返回电路编辑</button></div>';
}
