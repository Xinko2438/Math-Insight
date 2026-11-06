const system=String.raw`\left\{\begin{aligned}x+y&=7\\2x-y&=8\end{aligned}\right.`
const questionDoc={version:1,blocks:[{id:'q-text',type:'text',text:'3. 解方程组：\n'},{id:'q-system',type:'math',latex:system,display:'block'}]}
const wrongAnswerDoc={version:1,blocks:[
 {id:'a-text',type:'text',text:'解：\n由 '},{id:'a-inline',type:'math',latex:'x+y=7',display:'inline'},
 {id:'a-prose',type:'text',text:'，得 '},{id:'a-y',type:'math',latex:'y=7-x',display:'inline'},
 {id:'a-sub',type:'text',text:'\n把 '},{id:'a-y-sub',type:'math',latex:'y=7-x',display:'inline'},
 {id:'a-into',type:'text',text:' 代入 '},{id:'a-second',type:'math',latex:'2x-y=8',display:'inline'},
 {id:'a-work',type:'math',latex:String.raw`\begin{aligned}2x-(7-x)&=8\\3x-7&=8\\3x&=15\\x&=5\end{aligned}`,display:'block'},
 {id:'a-back',type:'text',text:'\n把 '},{id:'a-x',type:'math',latex:'x=5',display:'inline'},
 {id:'a-back-into',type:'text',text:' 代入 '},{id:'a-first',type:'math',latex:'x+y=7',display:'inline'},
 {id:'a-get',type:'text',text:'\n得 '},{id:'a-y-final',type:'math',latex:'y=2',display:'inline'},
 {id:'a-end',type:'text',text:'\n所以 '},{id:'a-final',type:'math',latex:String.raw`\boxed{x=5,\quad y=2}`,display:'inline'},{id:'a-dot',type:'text',text:'。'}
]}
const formulas=[system,String.raw`\frac{x+1}{2}+\frac{1}{1+\frac{1}{x}}`,String.raw`\sqrt{x^2+1}\leq\frac{a_1}{b^2}<3`,String.raw`f(x)=\begin{cases}x^2&x\geq0\\-x&x<0\end{cases}`,String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`,String.raw`\int_0^1 x^2\,dx`,String.raw`\vec{AB}\perp\vec{CD}`,String.raw`\overrightarrow{AB}\parallel\overrightarrow{CD}`,String.raw`\sum_{i=1}^{n}i`,String.raw`\lim_{x\to0}\frac{\sin x}{x}`,String.raw`\widehat{ABC}=60^\circ`]
module.exports={questionDoc,wrongAnswerDoc,formulas}
