const docs=require('../../utils/math-document')
const {renderFormula}=require('../../vendor/math/runtime')
const cache=new Map()
Component({
  properties:{documentJson:{type:String,value:''},text:{type:String,value:''},editable:{type:Boolean,value:false},field:{type:String,value:''}},
  data:{rows:[]},
  observers:{'documentJson,text':function(documentJson,text){let source;try{source=documentJson?docs.validateDoc(JSON.parse(documentJson)):docs.fromText(text)}catch(_){source=docs.fromText(text)}const rows=source.blocks.map(b=>{if(b.type==='text')return b;try{const key=b.display+'\n'+b.latex;let nodes=cache.get(key);if(!nodes){nodes=renderFormula(b.latex,b.display==='block');if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,nodes)}return{...b,nodes,error:false}}catch(_){return{...b,error:true}}});this.setData({rows})}},
  methods:{select(e){if(!this.properties.editable)return;const row=this.data.rows.find(b=>b.id===e.currentTarget.dataset.id);if(row)this.triggerEvent('edit',{field:this.properties.field,id:row.id,type:row.type})}}
})
