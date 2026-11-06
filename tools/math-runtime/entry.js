const { parseLatex } = require('@rojer/katex-mini')
const { parseMathMinimal } = require('@unified-latex/unified-latex-util-parse')
const { printRaw } = require('@unified-latex/unified-latex-util-print-raw')

// The minimal parser starts in math mode but environment bodies start in text
// mode. Reparse those bodies with the same parser, using their original source
// slices (never printRaw), and rebase every position before editing consumes it.
function parseEditableMath(source) {
  const lineStarts=[0]
  for(let i=0;i<source.length;i++)if(source[i]==='\n')lineStarts.push(i+1)
  function point(offset){let low=0,high=lineStarts.length;while(low+1<high){const mid=(low+high)>>1;if(lineStarts[mid]<=offset)low=mid;else high=mid}return{offset,line:low+1,column:offset-lineStarts[low]+1}}
  function rebase(nodes,offset){for(const n of nodes){if(n.position)n.position={start:point(n.position.start.offset+offset),end:point(n.position.end.offset+offset)};if(Array.isArray(n.content))rebase(n.content,offset)}}
  function normalize(nodes,depth=0){if(depth>32)throw Error('Math environment nesting exceeds the edit limit');
    const skipTrivia=at=>{while(nodes[at]&&['whitespace','comment'].includes(nodes[at].type))nodes.splice(at,1);return at}
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i];if(n.type!=='macro')continue
      if(['^','_'].includes(n.content)){if(n.position){const at=source.indexOf(n.content,n.position.start.offset);if(at>=0&&at<n.position.end.offset)n.position={start:point(at),end:point(at+1)}}skipTrivia(i+1)}
      if(['frac','dfrac','tfrac'].includes(n.content)){let j=skipTrivia(i+1);if(nodes[j]?.type==='group'){j=skipTrivia(j+1);if(nodes[j]?.type!=='group')n.editUnsupported=true}else n.editUnsupported=true}
      if(n.content==='sqrt'){let j=skipTrivia(i+1);if(nodes[j]?.content==='['){while(nodes[j]&&nodes[j].content!==']')j++;j=skipTrivia(j+1)}if(nodes[j]?.type!=='group')n.editUnsupported=true}
    }
    for(const n of nodes){
    if(n.type==='environment'&&Array.isArray(n.content)&&n.content.length){
      const first=n.content.find(x=>x.position),last=n.content.slice().reverse().find(x=>x.position)
      if(first&&last){const start=first.position.start.offset,end=last.position.end.offset;const body=parseMathMinimal(source.slice(start,end));rebase(body,start);n.content=body}
    }
    if(Array.isArray(n.content))normalize(n.content,depth+1)
  }}
  const nodes=parseMathMinimal(source);normalize(nodes);return nodes
}

function base64(text) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out=''
  for(let i=0;i<text.length;i+=3){const a=text.charCodeAt(i),b=text.charCodeAt(i+1),c=text.charCodeAt(i+2);out+=alphabet[a>>2]+alphabet[((a&3)<<4)|(Number.isNaN(b)?0:b>>4)]+(Number.isNaN(b)?'=':alphabet[((b&15)<<2)|(Number.isNaN(c)?0:c>>6)])+(Number.isNaN(c)?'=':alphabet[c&63])}
  return out
}
function normalizeSvg(node) {
  if(node.attrs && typeof node.attrs.src === 'string' && node.attrs.src.startsWith('data:image/svg+xml,')){
    let svg=decodeURIComponent(node.attrs.src.slice(node.attrs.src.indexOf(',')+1))
    const w=svg.match(/\bwidth="([\d.]+)em"/),h=svg.match(/\bheight="([\d.]+)em"/)
    if(h){const small=w && Number(w[1])<20;node.attrs.style=(node.attrs.style||'')+';width:'+(small?w[1]+'em':'100%')+';height:'+h[1]+'em;';svg=svg.replace(/width="[^"]*"/,'width="'+(small?Number(w[1])*20:400000)+'"').replace(/height="[^"]*"/,'height="'+Number(h[1])*20+'"').replace(/ style="[^"]*"/,'');node.attrs.src='data:image/svg+xml;base64,'+base64(svg)}
  }
  ;(node.children||[]).forEach(normalizeSvg)
  return node
}
function renderFormula(latex,display=true) {
  return parseLatex(latex,{displayMode:display,throwError:true,trust:false,maxExpand:1000,maxSize:20}).map(normalizeSvg)
}
// Only application-created numeric tags are trusted. The source never gets HTML trust.
function renderTaggedFormula(latex,ranges) {
  if(/\\(?:html\w*|href|url|includegraphics|def|gdef)\b/i.test(latex))throw Error('Unsafe formula source')
  let source=latex,last=latex.length
  for(let i=ranges.length-1;i>=0;i--){const r=ranges[i];if(!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>last)throw Error('Invalid token range');let tagged='\\htmlClass{mx-t'+i+'}{'+source.slice(r.start,r.end)+'}';if(/[\^_]\s*$/.test(latex.slice(0,r.start)))tagged='{'+tagged+'}';source=source.slice(0,r.start)+tagged+source.slice(r.end);last=r.start}
  return parseLatex(source,{displayMode:true,throwError:true,strict:false,trust:context=>context.command==='\\htmlClass'&&/^mx-t\d+$/.test(context.class),maxExpand:1000,maxSize:20}).map(normalizeSvg)
}
module.exports={renderFormula,renderTaggedFormula,parseMath:parseEditableMath,printRaw}
