/* Synthetic fixtures and the read-only cause-node catalog used by the offline candidate.
   No student data, no network, no model calls. */
const KP_ORDER = ['三角函数','对数','指数','方程','不等式','导数','积分','数列','概率','向量','解析几何','通用'];
const CATEGORIES = ['知识性错误','方法性错误','计算性错误','审题性错误'];
const NODES = [
  {id:'E01',name:'诱导公式符号判断错误',kp:'三角函数',category:'计算性错误'},
  {id:'E02',name:'忽略角的取值范围',kp:'三角函数',category:'方法性错误'},
  {id:'E03',name:'周期与单调区间计算错误',kp:'三角函数',category:'计算性错误'},
  {id:'E04',name:'图象平移伸缩方向混淆',kp:'三角函数',category:'知识性错误'},
  {id:'E44',name:'函数奇偶性判断忽略定义域',kp:'三角函数',category:'知识性错误'},
  {id:'E45',name:'三角函数图像变换顺序错误',kp:'三角函数',category:'方法性错误'},
  {id:'E05',name:'忽略真数大于零的条件',kp:'对数',category:'方法性错误'},
  {id:'E06',name:'对数运算法则记混',kp:'对数',category:'知识性错误'},
  {id:'E07',name:'换底公式使用不当',kp:'对数',category:'方法性错误'},
  {id:'E08',name:'对数函数定义域遗漏',kp:'对数',category:'方法性错误'},
  {id:'E09',name:'指数运算法则混淆',kp:'指数',category:'知识性错误'},
  {id:'E10',name:'忽略底数取值条件',kp:'指数',category:'方法性错误'},
  {id:'E11',name:'指数函数与幂函数概念混淆',kp:'指数',category:'知识性错误'},
  {id:'E12',name:'判别式使用条件不清',kp:'方程',category:'知识性错误'},
  {id:'E13',name:'韦达定理符号出错',kp:'方程',category:'计算性错误'},
  {id:'E14',name:'增根漏检验',kp:'方程',category:'方法性错误'},
  {id:'E15',name:'分类讨论不完整',kp:'方程',category:'方法性错误'},
  {id:'E16',name:'乘除负数忘记变号',kp:'不等式',category:'知识性错误'},
  {id:'E17',name:'均值不等式取等条件忽略',kp:'不等式',category:'方法性错误'},
  {id:'E18',name:'多次放缩取等条件冲突',kp:'不等式',category:'方法性错误'},
  {id:'E19',name:'解集端点开闭判断错误',kp:'不等式',category:'方法性错误'},
  {id:'E20',name:'复合函数漏用链式法则',kp:'导数',category:'知识性错误'},
  {id:'E21',name:'极值点判定条件误用',kp:'导数',category:'知识性错误'},
  {id:'E22',name:'单调区间端点处理不当',kp:'导数',category:'方法性错误'},
  {id:'E23',name:'切线“在点”与“过点”混淆',kp:'导数',category:'审题性错误'},
  {id:'E49',name:'导数含参讨论不完整',kp:'导数',category:'方法性错误'},
  {id:'E24',name:'不定积分漏加常数C',kp:'积分',category:'知识性错误'},
  {id:'E25',name:'定积分上下限代入错误',kp:'积分',category:'计算性错误'},
  {id:'E26',name:'换元后积分限未同步变换',kp:'积分',category:'方法性错误'},
  {id:'E27',name:'等差等比公式记混',kp:'数列',category:'知识性错误'},
  {id:'E28',name:'n=1 特殊情况未验证',kp:'数列',category:'方法性错误'},
  {id:'E29',name:'递推关系转化错误',kp:'数列',category:'方法性错误'},
  {id:'E30',name:'求和公式使用前提忽略',kp:'数列',category:'方法性错误'},
  {id:'E50',name:'数学归纳法第二步未用假设',kp:'数列',category:'方法性错误'},
  {id:'E31',name:'排列与组合概念混淆',kp:'概率',category:'知识性错误'},
  {id:'E32',name:'基本事件空间列举不全',kp:'概率',category:'方法性错误'},
  {id:'E33',name:'条件概率与独立事件混淆',kp:'概率',category:'知识性错误'},
  {id:'E48',name:'排列组合重复计数',kp:'概率',category:'方法性错误'},
  {id:'E34',name:'数量积夹角判断错误',kp:'向量',category:'知识性错误'},
  {id:'E35',name:'垂直平行充要条件记混',kp:'向量',category:'知识性错误'},
  {id:'E36',name:'向量坐标运算符号出错',kp:'向量',category:'计算性错误'},
  {id:'E46',name:'立体几何空间角计算错误',kp:'向量',category:'计算性错误'},
  {id:'E37',name:'斜率不存在情形遗漏',kp:'解析几何',category:'方法性错误'},
  {id:'E38',name:'联立后判别式条件忽略',kp:'解析几何',category:'方法性错误'},
  {id:'E39',name:'焦点位置与标准方程误判',kp:'解析几何',category:'知识性错误'},
  {id:'E47',name:'圆锥曲线离心率范围忽略',kp:'解析几何',category:'方法性错误'},
  {id:'E40',name:'审题不清漏看条件',kp:'通用',category:'审题性错误'},
  {id:'E41',name:'计算过程粗心出错',kp:'通用',category:'计算性错误'},
  {id:'E42',name:'公式记忆不准确',kp:'通用',category:'知识性错误'},
  {id:'E43',name:'解题步骤不规范',kp:'通用',category:'方法性错误'}
];
const NODE_BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));

/* Twelve synthetic records. The same array drives both the report and the statistics. */
const RECORDS = [
  {id:'r01',kp:'对数',date:'11-04',question:'解方程 log₂(x−1)+log₂(x−3)=2。',causeIds:['E05','E06']},
  {id:'r02',kp:'对数',date:'11-03',question:'求函数 y=log₂(3−2x−x²) 的定义域。',causeIds:['E05']},
  {id:'r03',kp:'对数',date:'11-03',question:'解方程 log₂(x−1)+log₂(x−3)=2，并检验。',causeIds:['E05','E14']},
  {id:'r04',kp:'对数',date:'11-02',question:'化简 log₂8−log₂2。',causeIds:['E05','E41']},
  {id:'r05',kp:'对数',date:'11-02',question:'比较 log₂3 与 log₃5 的大小。',causeIds:['E06','E42']},
  {id:'r06',kp:'方程',date:'11-01',question:'解分式方程 (x+1)/(x−1)=2。',causeIds:['E14','E41']},
  {id:'r07',kp:'方程',date:'11-01',question:'解方程 √(2x+3)=x。',causeIds:['E14']},
  {id:'r08',kp:'方程',date:'10-31',question:'已知方程 x²−2x+m=0 有两个实根，求 m 的范围。',causeIds:['E40']},
  {id:'r09',kp:'不等式',date:'10-31',question:'解不等式 (2x−1)/(x+3) ≥ 1。',causeIds:['E19']},
  {id:'r10',kp:'不等式',date:'10-30',question:'解不等式 x²−4x+3<0。',causeIds:['E40']},
  {id:'r11',kp:'数列',date:'10-30',question:'已知 S_n=n²+1，求通项 a_n。',causeIds:['E28']},
  {id:'r12',kp:'通用',date:'10-29',question:'计算 (a+b)²−(a−b)²。',causeIds:['E42']}
];

const STEPS_SHORT = [
  {
    question:'先看题目：这个方程里，哪些部分决定了 x 不能随便取？',
    hint:'对数里的真数必须大于 0。先别急着合并，先把两个真数的条件写出来。',
    detail:'由 x−1>0 且 x−3>0，得 x>3。这个范围要保留到最后一步。'
  },
  {
    question:'同底对数相加，可以怎样合并？',
    hint:'同底对数相加，先变成真数相乘；不是把两个真数直接相加。',
    detail:'log₂(x−1)+log₂(x−3)=log₂[(x−1)(x−3)]，所以 (x−1)(x−3)=2²=4。'
  },
  {
    question:'解出二次方程后，为什么要回到第 1 步？',
    hint:'二次方程可能给出两个根，但只有一个根落在定义域里。',
    detail:'展开得 x²−4x−1=0，解得 x=2±√5。因为 x>3，所以 x=2−√5 舍去，保留 x=2+√5。'
  }
];

const STEPS_LONG = [
  {
    question:'题目同时给了对数式和不等式组。第一步应该先处理哪一个条件？',
    hint:'先写对数真数大于 0 的条件，再看分母不能为 0。定义域是后面所有步骤的共同前提。',
    detail:'由 x−1>0、x−3>0，得 x>3；分母 x−3≠0 已被 x>3 包含。'
  },
  {
    question:'对数方程合并后，得到什么二次关系？',
    hint:'同底对数相加，真数相乘。右边 2 要写成 2²。',
    detail:'log₂[(x−1)(x−3)]=2，所以 (x−1)(x−3)=4，即 x²−4x−1=0。'
  },
  {
    question:'不等式组里的分式不等式，怎样与二次方程的结果合在一起？',
    hint:'因为 x>3，分母 x−3 为正，分式不等式可以直接转化为分子 ≤ 0。',
    detail:'在 x>3 时，(x²−4x−1)/(x−3)≤0 等价于 x²−4x−1≤0，即 x∈[2−√5, 2+√5]。与 x>3 取交集。'
  },
  {
    question:'最后怎样排除增根？',
    hint:'把候选根代回原方程，检查两个真数是否都大于 0。',
    detail:'x=2+√5≈4.236>3，代回两个真数都为正；x=2−√5≈−0.236 不满足 x>3，舍去。'
  }
];

const VARIANTS = [
  {
    level:'基础巩固',
    question:'解方程 log₂(x+1)+log₂(x−1)=3。',
    answer:'x=3',
    analysis:'定义域为 x>1。合并得 (x+1)(x−1)=8，即 x²=9，所以 x=±3；只有 x=3 满足 x>1。'
  },
  {
    level:'迁移',
    question:'解方程 log₃(x−2)+log₃(x+4)=2。',
    answer:'x=−1+3√2',
    analysis:'定义域为 x>2。合并得 (x−2)(x+4)=9，即 x²+2x−17=0，解得 x=−1±3√2；只有 x=−1+3√2>2 符合定义域。'
  },
  {
    level:'挑战',
    question:'解方程 log₂(x−1)+log₂(x−3)=log₂(2x−1)。',
    answer:'x=3+√5',
    analysis:'定义域为 x>3。合并得 (x−1)(x−3)=2x−1，即 x²−6x+4=0，解得 x=3±√5；只有 x=3+√5>3 符合定义域。'
  }
];

const REPORT_SHORT = {
  kp:'对数',
  source:'AI 诊断',
  questionHTML:'解方程：<span class="math">log<sub>2</sub>(x−1) + log<sub>2</sub>(x−3) = 2</span>。',
  answerHTML:'x−1+x−3=2，所以 2x−4=2，x=3。',
  summaryTitle:'忽略真数大于零的条件',
  summaryCategory:'方法性错误',
  summaryText:'把两个对数直接相加成真数相加，也没有先写定义域；x=3 会让第二个真数变成 0。',
  diagnosis:'这次的主要问题不是计算，而是对数的使用条件。你的第一步把 log₂(x−1)+log₂(x−3) 写成了 (x−1)+(x−3)，这不符合同底对数相加的法则；同时没有先写出 x−1>0、x−3>0，所以最后得到的 x=3 没有被定义域拦住。',
  causes:[
    {id:'E05',evidence:'没有先写 x−1>0、x−3>0；x=3 使第二个真数为 0。'},
    {id:'E06',evidence:'把 log₂(x−1)+log₂(x−3) 写成了 (x−1)+(x−3)。'},
    {id:'E14',evidence:'得到 x=3 后没有代回原方程检验。'}
  ],
  confidence:78,
  steps:STEPS_SHORT,
  solutionHTML:'<p><strong>定义域：</strong>由 x−1>0、x−3>0，得 x>3。</p><p><strong>合并对数：</strong>log₂[(x−1)(x−3)]=2，所以 (x−1)(x−3)=4。</p><p><strong>解二次方程：</strong>x²−4x−1=0，x=2±√5。</p><p><strong>检验：</strong>x=2−√5≈−0.236 不满足 x>3，舍去；x=2+√5≈4.236 满足定义域。</p><p class="solution-final">所以原方程的解是 x=2+√5。</p>',
  variants:VARIANTS
};

const REPORT_LONG = {
  kp:'对数',
  source:'AI 诊断',
  questionHTML:'已知 x 满足 <span class="math">log<sub>2</sub>(x−1) + log<sub>2</sub>(x−3) = 2</span>，且 x 同时满足不等式组：<div class="formula-system"><div class="formula-line">x−1 &gt; 0，x−3 &gt; 0</div><div class="formula-line"><span class="frac"><span class="num">x<sup>2</sup>−4x−1</span><span class="den">x−3</span></span> ≤ 0</div></div>求 x 的值，并说明定义域与增根检验在解题中的作用。',
  answerHTML:'x−1+x−3=2，所以 2x−4=2，x=3。',
  summaryTitle:'忽略真数大于零的条件',
  summaryCategory:'方法性错误',
  summaryText:'长题里仍然先合并了真数，没有把定义域和分式不等式的条件放在第一步；x=3 不是原方程的解。',
  diagnosis:'题目变长后，核心错误没有变：你把两个对数直接相加成真数相加，并且没有先写 x−1>0、x−3>0。后面的不等式组也没有被用来筛选候选根。长题更需要先把条件列清楚，再动方程。',
  causes:[
    {id:'E05',evidence:'没有先写 x−1>0、x−3>0；x=3 使第二个真数为 0。'},
    {id:'E06',evidence:'把 log₂(x−1)+log₂(x−3) 写成了 (x−1)+(x−3)。'},
    {id:'E14',evidence:'得到 x=3 后没有代回原方程，也没有与不等式组取交集。'}
  ],
  confidence:74,
  steps:STEPS_LONG,
  solutionHTML:'<p><strong>定义域：</strong>由 x−1>0、x−3>0，得 x>3；分母 x−3≠0 已包含在内。</p><p><strong>合并对数：</strong>log₂[(x−1)(x−3)]=2，所以 (x−1)(x−3)=4，即 x²−4x−1=0。</p><p><strong>解二次方程：</strong>x=2±√5。</p><p><strong>合并不等式：</strong>因为 x>3，分母为正，所以 (x²−4x−1)/(x−3)≤0 等价于 x²−4x−1≤0，即 x∈[2−√5, 2+√5]。</p><p><strong>取交集并检验：</strong>与 x>3 取交集，只剩 x=2+√5；代回原方程，两个真数都大于 0。</p><p class="solution-final">所以 x=2+√5。</p>',
  variants:VARIANTS
};

const REPORT_EMPTY = null;

