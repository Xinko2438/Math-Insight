/* Offline candidate controller: plain DOM, no framework, no network. */
(function () {
  'use strict';

  const REPORT_RULE = {
    kp: '对数',
    source: '基础提示',
    questionHTML: '解方程：<span class="math">log<sub>2</sub>(x−1) + log<sub>2</sub>(x−3) = 2</span>。',
    answerHTML: 'x−1+x−3=2，所以 2x−4=2，x=3。',
    summaryTitle: '先检查对数成立的条件',
    summaryCategory: '未完成诊断',
    summaryText: '这次没有可用的 AI 诊断。以下只帮助回顾对数成立的条件，不能判断你的作答对错。',
    diagnosis: '当前没有足够的诊断结果。可以先检查两个真数是否都大于 0；完整分析需要重新提交。这里不把通用提示当成针对这道题的诊断。',
    causes: [],
    confidence: null,
    steps: STEPS_SHORT.map(s => ({ question: s.question, hint: s.hint, detail: '' })),
    solutionHTML: '',
    variants: []
  };

  const state = {
    page: 'report',
    variant: 'short',
    fixture: 'default',
    fixtureExpanded: false,
    f3Variant: 'cases',
    f7Steps: 'steps4',
    f7NoVariants: false,
    viewport: '390',
    tab: 'steps',
    hints: {},
    details: {},
    solutionOpen: false,
    variantsOpen: {},
    expandedKp: {}
    ,allCausesOpen: false
  };

  /* A render rebuilds the phone content. Only an in-place reveal restores reading
     position; page navigation, fixture switches and the explicit return-to-top do not. */
  let readingAnchor = null;

  function markReadingAnchor(action, key) {
    const active = document.activeElement;
    const el = active && screen.contains(active) ? active : null;
    readingAnchor = {
      action, key,
      top: screen.scrollTop,
      tab: state.tab
    };
  }

  function restoreReadingPosition() {
    if (!readingAnchor) { screen.scrollTop = 0; return; }
    const a = readingAnchor;
    let selector = null;
    if (a.action === 'hint' || a.action === 'detail') selector = '[data-action="' + a.action + '"][data-index="' + a.key + '"]';
    else if (a.action === 'solution') selector = '[data-action="solution"]';
    else if (a.action === 'variant') selector = '[data-action="variant"][data-index="' + a.key + '"]';
    else if (a.action === 'branch') selector = '[data-action="branch"][data-kp="' + a.key + '"]';
    else if (a.action === 'more-causes') selector = '[data-action="more-causes"]';
    if (a.action === 'more-causes' && state.allCausesOpen) selector = '.more-list';
    const target = selector ? screen.querySelector(selector) : null;
    if (target) {
      const rect = target.getBoundingClientRect();
      const box = screen.getBoundingClientRect();
      /* Put the toggled control near its prior vertical position, and make its newly opened copy visible. */
      if (rect.top < box.top || rect.top > box.bottom - 48) {
        const targetTop = screen.scrollTop + rect.top - box.top - 12;
        const maxScroll = Math.max(0, screen.scrollHeight - screen.clientHeight);
        screen.scrollTop = Math.min(maxScroll, Math.max(0, targetTop));
      }
    }
    readingAnchor = null;
  }

  const phone = document.getElementById('phone');
  const screen = document.getElementById('screen');
  const appbar = document.getElementById('appbar');
  const tabbar = document.getElementById('tabbar');
  const viewportNote = document.getElementById('viewportNote');

  const ICONS = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5h-2.5V21h-13V10.5Z"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5Z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20"/><path d="M12 3v18"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M13 16V7"/><path d="M18 16v-9"/></svg>'
  };

  function currentReport() {
    if (['F1','F2','F3','F4','F5','F6','F7','F8'].includes(state.fixture)) {
      return fixtureReport(state.fixture);
    }
    if (state.variant === 'zero') return null;
    if (state.variant === 'long') return REPORT_LONG;
    if (state.variant === 'rule') return REPORT_RULE;
    return REPORT_SHORT;
  }

  function formatPercent(n, d) {
    return d ? Math.round(n / d * 100) : 0;
  }

  function buildStats() {
    if (['S0','S1','S2','S50'].includes(state.fixture)) return fixtureStats(state.fixture);
    return computeStats(state.variant === 'zero' ? [] : RECORDS);
  }

  function makeStats(records, library) {
    const NODES = library && library.nodes ? library.nodes : (library && library.NODES) || (typeof NODES_GLOBAL !== 'undefined' ? NODES_GLOBAL : []);
    const KP_ORDER = (library && (library.kpOrder || (library.NODES && library.kpOrder))) || [];
    const CATEGORIES = (library && (library.categories || (library.NODES && library.categories))) || [];
    const nodeById = {};
    NODES.forEach(n => { nodeById[n.id] = n; });
    const flatten = r => {
      /* Current saved shape: record.result.knowledgePoint/causeNodes. Top-level values are not counted. */
      const result = r.result || {};
      return { kp: typeof result.knowledgePoint === 'string' ? result.knowledgePoint : '',
        nodes: Array.isArray(result.causeNodes) ? result.causeNodes.slice() : [] };
    };
    const kpMap = {};
    const causeMap = {};
    const countMap = {};
    const extraMap = {};
    const unknownNodes = [];
    records.forEach(r => {
      const resolved = flatten(r);
      const kp = resolved.kp;
      if (kp) kpMap[kp] = (kpMap[kp] || 0) + 1;
      else extraMap.noKp = (extraMap.noKp || 0) + 1;
      const seenInRecord = {};
      resolved.nodes.forEach(input => {
        const id = typeof input === 'string' ? input : String(input.id || '');
        const supplied = typeof input === 'string' ? null : input;
        const n = nodeById[id] || (supplied && supplied.name ? supplied : (id ? { id, name: id, kp: '', category: '' } : null));
        if (!n) return;
        const key = n.id || n.name;
        if (seenInRecord[key]) return;
        seenInRecord[key] = true;
        if (!nodeById[n.id] || !n.category || (n.unknown)) {
          extraMap[key] = (extraMap[key] || 0) + 1;
          unknownNodes.push(n);
          return;
        }
        causeMap[n.name] = (causeMap[n.name] || 0) + 1;
        countMap[n.id] = (countMap[n.id] || 0) + 1;
      });
    });
    const kpAll = KP_ORDER.map(name => ({
      name,
      count: kpMap[name] || 0,
      percent: formatPercent(kpMap[name] || 0, records.length)
    }));
    const kpExtra = Object.keys(extraMap).filter(k => k === 'noKp').length
      ? [{ name: '未记录考点', count: extraMap.noKp, percent: formatPercent(extraMap.noKp, records.length) }]
      : [];
    const kpDisplay = kpAll.concat(kpExtra);
    const causeStats = Object.entries(causeMap)
      .map(([name, count]) => {
        const node = NODES.find(n => n.name === name);
        return { name, count, category: node ? node.category : '未分类', id: node ? node.id : '' };
      })
      .sort((a, b) => b.count - a.count || NODES.findIndex(n => n.name === a.name) - NODES.findIndex(n => n.name === b.name));
    Object.keys(extraMap).filter(k => k !== 'noKp').forEach(key => {
      const sample = unknownNodes.find(n => (n.id || n.name) === key) || {};
      causeStats.push({ name: sample.name || key, count: extraMap[key], category: '未分类', id: sample.id || '', unknown: true });
    });
    causeStats.sort((a, b) => b.count - a.count || (a.unknown ? 1 : -1) - (b.unknown ? 1 : -1) || NODES.findIndex(n => n.name === a.name) - NODES.findIndex(n => n.name === b.name));
    const causeTop = causeStats.slice(0, 5);
    const causeMax = causeStats.length ? causeStats[0].count : 0;
    const causeDisplay = CATEGORIES.map(name => ({
      name,
      count: NODES.filter(n => n.category === name).reduce((sum, n) => sum + (countMap[n.id] || 0), 0)
    }));
    const unknownIds = Object.keys(extraMap).filter(k => k !== 'noKp');
    const unknownCount = unknownIds.reduce((sum, k) => sum + extraMap[k], 0);
    if (unknownCount) {
      causeDisplay.push({ name: '未分类', count: unknownCount });
    }
    /* Within a KP, category groups follow the frozen node library's first appearance; nodes keep NODES order.
       Nothing is sorted by count or name, so zero and nonzero states share one tree. */
    const causeTree = KP_ORDER.slice().map(kp => {
      const kpNodes = NODES.filter(n => n.kp === kp);
      const kpCats = kpNodes.reduce((list, n) => list.includes(n.category) ? list : list.concat(n.category), []);
      const categories = kpCats.map(cat => {
        const children = kpNodes
          .filter(n => n.category === cat)
          .map(n => ({ id: n.id, name: n.name, count: countMap[n.id] || 0 }));
        return { name: cat, count: children.reduce((s, c) => s + c.count, 0), children };
      }).filter(c => c.children.length);
      return {
        name: kp,
        count: categories.reduce((s, c) => s + c.count, 0),
        categories
      };
    });
    const unknownTree = unknownNodes.length ? [{
      name: '其他',
      count: unknownNodes.reduce((sum, n) => sum + (extraMap[n.id || n.name] || 0), 0),
      categories: [{ name: '未分类', count: unknownNodes.reduce((sum, n) => sum + (extraMap[n.id || n.name] || 0), 0),
        children: unknownNodes.map(n => ({ id: n.id || '', name: n.name || '未知节点', count: extraMap[n.id || n.name] || 0 })) }]
    }] : [];
    /* Unknown names are not inferred from synthetic-key order; keep their supplied order. */
    const offset = KP_ORDER.length === 0 ? -2 : -1;
    const tree = causeTree.slice(0, KP_ORDER.length ? KP_ORDER.length : 0).concat(
      causeTree.slice(KP_ORDER.length).sort((a, b) => {
        const ai = Object.keys({}).length;
        return KP_ORDER.indexOf(a.name) - KP_ORDER.indexOf(b.name);
      })).concat(unknownTree);
    const total = records.length;
    const kpCount = Object.keys(kpMap).filter(k => kpMap[k] > 0).length;
    const causeCount = causeStats.length;
    const causeTotal = causeStats.reduce((sum, c) => sum + c.count, 0);
    const kpRanked = kpDisplay.slice().sort((a, b) => b.count - a.count || KP_ORDER.indexOf(a.name) - KP_ORDER.indexOf(b.name));
    const topKp = kpRanked[0];
    const topCause = causeStats[0] || null;
    const kpHigh = kpRanked.filter(item => item.count > 0);
    const kpHighest = kpHigh.slice(0, 4);
    const noKpCount = extraMap.noKp || 0;
    return { records, total, kpCount, causeCount, causeTotal, kpDisplay, kpRanked, kpHigh, kpHighest, causeStats, causeStatsAll: causeStats, causeTop, causeMax, causeDisplay, causeTree: tree, topKp, topCause, noKpCount, unknownCount, unknownIds, library: { kpOrder: KP_ORDER, categories: CATEGORIES, nodes: NODES } };
  }

  function computeStats(records) {
    const officialLibrary = { kpOrder: KP_ORDER, categories: CATEGORIES, nodes: NODES };
    /* Legacy flat demo records are adapted once here. makeStats itself reads only record.result. */
    const flat = records.map(r => r.result ? {
      id: r.id, date: r.date, question: r.question, source: r.source,
      result: { knowledgePoint: r.result.knowledgePoint || '', causeNodes: r.result.causeNodes || [] }
    } : {
      id: r.id, date: r.date, question: r.question, source: r.source,
      result: { knowledgePoint: r.kp || '', causeNodes: (r.causeIds || []).map(id => NODE_BY_ID[id] || { id, name: id, kp: '', category: '' }) }
    });
    return makeStats(flat, officialLibrary);
  }

  function fixtureReport(id) {
    if (id === 'F7') {
      const report = Object.assign({}, F7_REPORT);
      report.steps = R3_STEPS[state.f7Steps] || [];
      if (state.f7NoVariants) report.variants = [];
      return report;
    }
    if (id === 'F8') {
      const report = Object.assign({}, F8_REPORT);
      report.questionHTML = report.questionHTML.replace('</div></div>', '</div></div>' +
        '<div class="repeat-block" aria-label="30次布局压力文本">' +
        Array(30).fill('<p>请保留每一步的符号与括号。</p>').join('') + '</div>');
      return report;
    }
    if (id === 'F4') {
      const report = Object.assign({}, FIXTURE_REPORT.F4 || {});
      report.id = 'F4';
      report.title = 'F4 正确作答';
      report.kp = '方程';
      report.sourceLabel = '演示内容 · 暂无可展示错因';
      report.questionHTML = '解方程：<span class="math">2(x − 3) = x + 4</span>。';
      report.answerLines = ['2x−6=x+4', 'x=10'];
      report.emptyAnswer = '';
      report.summaryTitle = '原作答已保留；暂无可展示错因';
      report.summaryCategory = '暂无可展示错因';
      report.summaryText = '这次没有可展示的错因。暂不把“没有错因”当成“已经掌握”或“确认正确”；可以对照原题与自己的过程独立检查。';
      report.diagnosis = '暂无可展示错因；空值不等于对错判定，也可能只是信息不足。原作答保留，请对照原题独立检查。';
      report.causes = [];
      report.source = 'ai';
      report.confidence = null;
      report.steps = [];
      report.solutionHTML = '';
      report.solutionNote = '本次没有可直接展示的完整解答。';
      report.variants = [];
      report.footer = '演示内容 · 原作答保留；暂无可展示错因与掌握结论。';
      return report;
    }
    if (id === 'F3') {
      const f3 = state.f3Variant || 'cases';
      const report = {
        id, title: id === 'F3' ? 'F3 结构显示包' : 'F4 正确作答', kp: '方程',
        sourceLabel: id === 'F3' ? '演示内容 · 合成结构样例' : '演示内容 · 暂无可展示错因',
        questionHTML: id === 'F4' ? '解方程：<span class="math">2(x − 3) = x + 4</span>。'
          : f3 === 'cases'
          ? '解方程组：<span class="math cases-display" aria-label="两行方程组"><span class="cases-brace" aria-hidden="true">{</span><span class="cases-lines"><span class="cases-row"><span class="frac"><span class="num">x</span><span class="den">2</span></span> + y = 3</span><span class="cases-row">x − y = 0</span></span></span>'
          : f3 === 'recursive'
            ? '递推式：<span class="math">a<sub>n+1</sub> = <span class="frac"><span class="num">a<sub>n</sub><sup>2</sup> + 1</span><span class="den">n + 1</span></span></span>'
            : '根式：<span class="radicand"><span class="radical-sign" aria-label="平方根">√</span><span class="radical-body">x + 1</span></span>',
        answerLines: id === 'F3' ? ['x=y=3。'] : ['2x−6=x+4','x=10'],
        summaryTitle: id === 'F3' ? '先核对方程组的两条等式' : '原作答已保留；没有可确认的错因',
        summaryCategory: id === 'F3' ? '结构显示样例' : '暂无可展示错因',
        summaryText: id === 'F3'
          ? '学生的 x=y=3 已按原样保留。这里只检查方程组、递推式和根式是否显示完整，暂无可展示错因。'
          : '这次没有可展示的错因。暂不把“没有错因”当成“已经掌握”或“确认正确”；可以对照原题与自己的过程独立检查。',
        diagnosis: id === 'F3'
          ? '三种公式只用于检查显示结构，不作为诊断结论。递推式和根式与方程组分开查看，不合并为同一道题。'
          : '暂无可展示错因；暂无依据判断正误，也可能只是信息不足。原作答保留，请对照原题独立检查。',
        causes: [], source: 'ai', confidence: null,
        steps: id === 'F3' ? [{question:'两个方程分别表示什么？',hint:'先找相同变量，再考虑能否代入。',detail:''}] : [],
        solutionHTML: '',
        solutionNote: id === 'F3' ? '本次不提供完整解答；请先检查 x=y=3 是否满足第一式。' : '本次没有可直接展示的完整解答。',
        variants: [],
        extraDisplay: id === 'F3' ? '<div class="structured-extras" aria-label="结构显示样例"><div class="display-string"><span class="display-kicker">结构样例 · 递推式</span><span class="math">a<sub>n+1</sub> = <span class="frac"><span class="num">a<sub>n</sub><sup>2</sup> + 1</span><span class="den">n + 1</span></span></span></div><div class="display-string"><span class="display-kicker">结构样例 · 根式</span><span class="radicand"><span class="radical-sign" aria-label="平方根">√</span><span class="radical-body">x + 1</span></span></div><p class="quiet">两个公式样例不合并成同一道题，也不作为诊断结论。</p></div>' : '',
        footer: id === 'F3' ? '演示内容 · 三组公式只检查显示结构，不作为诊断结论。' : '演示内容 · 原作答保留；暂无可展示错因与掌握结论。'
      };
      return report;
    }
    return FIXTURE_REPORT[id] || null;
  }

  function fixtureStats(id) {
    if (id === 'S0') return withLabel(makeStats([], { kpOrder: KP_ORDER, categories: CATEGORIES, nodes: NODES }), id);
    if (id === 'S50') return withLabel(makeStats([], { kpOrder: KP_ORDER, categories: CATEGORIES, nodes: NODES }), id);
    if (id === 'S1') return withLabel(makeStats(R3_RECORDS.S1, R3_LIBRARIES.S1), id);
    if (id === 'S2') return withLabel(makeStats(R3_RECORDS.S2, R3_LIBRARIES.S2), id);
    return null;
  }

  const FIXTURE_NOTES = {
    F1:'F1 · 冻结两行作答；摘要不出现解答。',
    F2:'F2 · 作答 ±3 原样保留；提示不给 x=3。',
    F3:'F3 · cases／递推式／根式为独立显示串。',
    F4:'F4 · 演示页保留原作答；暂无可展示错因。',
    F5:'F5 · 缺少图形信息，空作答；不编造角度。',
    F6:'F6 · 基础复习参考；不含完整解答、变式或分数。',
    F7:'F7 · 步骤 0／1／4，可切换缺 hint/detail／无变式。',
    F8:'F8 · 30 次重复与 12 项长分式，完整可读。',
    S0:'S0 · 零记录与正式50节点同框架。',
    S1:'S1 · 冻结嵌套记录；Q1–Q3 是合成节点。',
    S2:'S2 · 未知 U 计入总数、分类、树与排行。',
    S50:'S50 · 正式50节点、12考点、4分类、零值。'
  };

  function withLabel(stats, id) {
    stats.fixtureId = id;
    stats.fixtureNote = FIXTURE_NOTES[id] || '';
    return stats;
  }

  function renderAppbar() {
    if (state.page === 'stats') {
      appbar.innerHTML = '<h2>学情分析</h2><span class="appbar-side">本机记录</span>';
    } else {
      appbar.innerHTML = '<button class="back" type="button" data-action="back" aria-label="返回">' + ICONS.back + '</button><h2>诊断报告</h2><span class="appbar-side">11-04</span>';
    }
  }

  function renderTabbar() {
    const active = state.page === 'stats' ? 'stats' : 'home';
    tabbar.innerHTML =
      '<button type="button" data-nav="home" aria-current="' + (active === 'home' ? 'page' : 'false') + '">' + ICONS.home + '<span>学习</span></button>' +
      '<button type="button" data-nav="history">' + ICONS.book + '<span>错题本</span></button>' +
      '<button type="button" data-nav="stats" aria-current="' + (active === 'stats' ? 'page' : 'false') + '">' + ICONS.chart + '<span>学情</span></button>';
  }

  function tag(text, cls) {
    return '<span class="tag ' + cls + '">' + text + '</span>';
  }

  function renderSummary(report) {
    const category = report.causes.length ? (NODE_BY_ID[report.causes[0].id] || {}).category || report.summaryCategory : report.summaryCategory;
    const catCls = report.causes.length ? 'tag-cause' : 'tag-muted';
    return '<section class="report-summary" aria-label="错因摘要">' +
      '<div class="summary-top">' + tag('考点 · ' + report.kp, 'tag-kp') + tag(category, catCls) + '</div>' +
      (report.sourceLabel ? '<div class="fixture-source"><span class="tag tag-muted">' + report.sourceLabel + '</span></div>' : '') +
      '<h3>' + report.summaryTitle + '</h3>' +
      '<p>' + report.summaryText + '</p>' +
      '<button class="summary-more" type="button" data-action="tab" data-tab="diagnosis">查看完整错因分析<span aria-hidden="true">→</span></button>' +
      '</section>';
  }

  function renderWorkCard(report) {
    return '<section class="work-card" aria-label="原题与我的作答">' +
      '<div class="work-head"><span class="label">原题</span>' + tag(report.kp, 'tag-kp') + '</div>' +
      '<div class="work-body">' +
        '<div class="q-text">' + report.questionHTML + '</div>' +
        '<div class="answer-block"><span class="label">我的作答（原样保留）</span>' +
          (report.answerLines && report.answerLines.length
            ? '<div class="answer-lines">' + report.answerLines.map(line => '<div class="answer-text">' + line + '</div>').join('') + '</div>'
            : report.emptyAnswer || !report.answerHTML
              ? '<div class="answer-text answer-empty">' + (report.emptyAnswer || '未提供作答') + '</div>'
              : '<div class="answer-text">' + (report.answerHTML || '') + '</div>') +
          '</div>' +
      '</div>' +
      '<div class="meta-row"><span class="quiet">原图留在本机</span>' + tag('标签可在错题本添加', 'tag-muted') + '</div>' +
      '</section>';
  }

  function renderTabs() {
    const tabs = [
      ['steps', '分步思考', '先自己想'],
      ['diagnosis', '错因分析', '看具体原因'],
      ['variants', '变式练习', '再独立做']
    ];
    return '<div class="report-tabs" role="tablist" aria-label="报告分区">' +
      tabs.map(([id, label, sub]) =>
        '<button class="report-tab" type="button" role="tab" data-action="tab" data-tab="' + id + '" aria-selected="' + (state.tab === id) + '">' +
        label + '<span class="tab-sub">' + sub + '</span></button>'
      ).join('') + '</div>';
  }

  function renderSteps(report) {
    const hasSteps = !!(report.steps && report.steps.length);
    const steps = (report.steps || []).map((s, i) => {
      const hintOpen = !!state.hints[i];
      const detailOpen = !!state.details[i];
      const actions = [];
      if (s.hint) {
        actions.push('<button class="act-hint" type="button" data-action="hint" data-index="' + i + '" aria-expanded="' + hintOpen + '">' +
          (hintOpen ? '收起提示' : '看提示') + '<span class="chev" aria-hidden="true">' + (hintOpen ? '▴' : '▾') + '</span></button>');
      }
      if (s.detail) {
        actions.push('<button class="act-detail" type="button" data-action="detail" data-index="' + i + '" aria-expanded="' + detailOpen + '">' +
          (detailOpen ? '收起本步解答' : '本步解答') + '<span class="chev" aria-hidden="true">' + (detailOpen ? '▴' : '▾') + '</span></button>');
      }
      return '<article class="step">' +
        '<div class="step-head"><span class="step-no">' + (i + 1) + '</span><p class="step-q">' + s.question + '</p></div>' +
        (actions.length ? '<div class="step-actions">' + actions.join('') + '</div>' : '') +
        (hintOpen && s.hint ? '<div class="reveal reveal-hint"><span class="reveal-label">提示 · 不直接给答案</span>' + s.hint + '</div>' : '') +
        (detailOpen && s.detail ? '<div class="reveal reveal-detail"><span class="reveal-label">本步解答</span>' + s.detail + '</div>' : '') +
        '</article>';
    }).join('');

    let solution = '';
    if (report.solutionHTML) {
      solution = '<div class="solution-block">' +
        '<button class="solution-toggle" type="button" data-action="solution" aria-expanded="' + state.solutionOpen + '">' +
          '<span class="st-left"><span class="st-title">' + (state.solutionOpen ? '收起完整解答' : '查看完整解答') + '</span>' +
          '<span class="st-sub">默认折叠；建议先完成上面的步骤</span></span>' +
          '<span class="plus" aria-hidden="true">' + (state.solutionOpen ? '−' : '+') + '</span>' +
        '</button>' +
        (state.solutionOpen ? '<div class="solution-body">' + report.solutionHTML + (report.solutionNote ? '<p class="solution-note">' + report.solutionNote + '</p>' : '') + '</div>' : '') +
      '</div>';
    } else {
      solution = '<p class="solution-lock">' + (report.solutionNote || '本次没有完整解答。通用提示不能替代针对这道题的答案。') + '</p>';
    }
    return (hasSteps
      ? '<div class="section-intro quiet" style="margin-bottom:9px">先自己回答每一步，再决定是否看提示或本步解答。</div>' + steps
      : '<div class="card"><p class="quiet">本次没有分步提示。</p></div>') + solution;
  }

  function renderDiagnosis(report) {
    const causes = (report.causes || [])
      .map(c => ({ node: NODE_BY_ID[c.id] || null, evidence: c.evidence }))
      .filter(c => c.node);
    let causeBlock = '';
    if (causes.length) {
      const top = causes[0].node;
      causeBlock = '<div class="cause-card">' +
        '<div class="cause-lead"><div class="cause-kicker">主要错因</div><div class="cause-name">' + top.name + '</div></div>' +
        causes.map(c => '<div class="cause-item"><span class="ci-mark" aria-hidden="true"></span><div class="ci-body">' +
          '<div class="ci-name">' + c.node.name + ' ' + tag(c.node.category, 'tag-cause') + '</div>' +
          '<div class="ci-ev">' + c.evidence + '</div></div></div>').join('') +
        '<p class="diagnosis-copy">' + report.diagnosis + '</p>' +
        (report.confidence !== null && report.confidence !== undefined
          ? '<div class="confidence"><span class="conf-value">诊断参考分数 ' + report.confidence + ' / 100</span><span>这是参考分数，不是经验证准确率，也不代表自动判分。</span></div>'
          : '') +
        '</div>';
    } else {
      causeBlock = '<div class="cause-card"><div class="rule-note">' + report.diagnosis + '</div></div>';
    }
    return causeBlock + (report.extraDisplay || '') + (report.footer ? '<p class="fixture-footer">' + report.footer + '</p>' : '');
  }

  function renderVariants(report) {
    if (!report.variants || !report.variants.length) {
      return '<div class="card"><p class="quiet">' + (state.fixture === 'F7' ? '本样例的变式已按冻结输入设为空；这里不自动生成替代练习。' : '本次没有变式题。基础提示状态不生成变式，避免把通用练习当成针对这道题的结果。') + '</p></div>';
    }
    return '<p class="quiet" style="margin:0 0 9px">先独立作答，再展开答案。这里只提供参考答案，不自动判分。</p>' +
      report.variants.map((v, i) => {
        const open = !!state.variantsOpen[i];
        return '<article class="variant">' +
          '<div class="variant-head">' + tag(v.level, 'tag-practice') + '</div>' +
          '<p class="variant-q">' + v.question + '</p>' +
          '<button class="variant-toggle" type="button" data-action="variant" data-index="' + i + '" aria-expanded="' + open + '">' +
            '<span>' + (open ? '收起答案与解析' : '展开答案与解析') + '</span>' +
            '<span class="vt-right"><span class="plus" aria-hidden="true">' + (open ? '−' : '+') + '</span></span>' +
          '</button>' +
          (open ? '<div class="variant-detail"><span class="vd-label">参考答案</span><div class="vd-answer">' + v.answer + '</div>' +
            '<div class="vd-analysis">' + v.analysis + '</div></div>' : '') +
          '</article>';
      }).join('');
  }

  function renderChat() {
    if (state.fixture !== 'default') return '';
    return '<section class="chat-block" aria-label="追问这道题">' +
      '<div class="chat-head"><h3 class="sec-title">追问这道题</h3><span class="quiet">没看懂再问</span></div>' +
      '<div class="chat-entry"><input class="chat-input" type="text" maxlength="120" placeholder="例如：为什么不能把真数直接相加？" aria-label="追问内容">' +
      '<button class="chat-send" type="button" data-action="chat">发送</button></div>' +
      '<p class="chat-hint">追问会沿用现有服务；本离线候选不连接模型，不发送内容。</p>' +
      '</section>';
  }

  function renderReport() {
    const report = currentReport();
    if (!report) {
      return '<div class="empty-report"><div class="er-mark" aria-hidden="true">＋</div>' +
        '<h3>暂无诊断报告</h3><p>录入题目并完成分析后，这里会显示原题、我的作答和错因摘要。</p>' +
        '<button class="btn-primary" type="button" data-action="empty-cta" style="max-width:220px;margin:0 auto">录入一道错题</button></div>';
    }
    let body = '';
    if (state.tab === 'steps') body = renderSteps(report);
    else if (state.tab === 'diagnosis') body = renderDiagnosis(report);
    else body = renderVariants(report);

    return '<div class="screen-pad">' +
      renderSummary(report) +
      renderWorkCard(report) +
      renderTabs() +
      '<div class="tab-panel">' + body + '</div>' +
      (state.tab === 'steps' ? renderChat() : '') +
      '<div class="again-wrap"><button class="btn-primary" type="button" data-action="again">录入下一题</button>' +
      '<button class="btn-secondary" type="button" data-action="top">回到顶部</button></div>' +
      '</div>';
  }

  function renderKpCell(item, topName) {
    return renderKpCellLite(item, topName);
  }

  function renderKpCellLite(item, topName) {
    const isTop = item.name === topName && item.count > 0;
    return '<div class="kp-cell lean-kp-cell' + (isTop ? ' is-top' : '') + (item.count ? '' : ' is-zero') + '">' +
      '<span class="kc-name">' + item.name + '</span><span class="kc-num">' + item.count + ' 题</span></div>';
  }

  function unusedKpCellOriginal(item, topName) {
    const isTop = item.name === topName && item.count > 0;
    const isZero = item.count === 0;
    return '<div class="kp-cell' + (isTop ? ' is-top' : '') + (isZero ? ' is-zero' : '') + '">' +
      '<div class="kc-top"><span class="kc-name" title="' + item.name + '">' + item.name + '</span>' +
      '<span class="kc-num">' + item.count + ' 题 · ' + item.percent + '%</span></div>' +
      '<div class="kc-track"><div class="kc-fill" style="width:' + item.percent + '%"></div></div>' +
      '</div>';
  }

  function renderStats() {
    try { return renderStatsBody(); } catch (e) {
      window.__r3error = String(e && e.message || e);
      return '<div class="screen-pad"><div class="card"><p class="quiet">该冻结样例渲染失败，见核验记录；没有替换成默认数据。</p></div></div>';
    }
  }

  function renderStatsBody() {
    const s = buildStats();
    if (!s || !s.records) return '<div class="screen-pad"><div class="card">学情样例未加载。</div></div>';
    const fixtureActive = !!s.fixtureId;
    const markedDates = s.records.filter(r => typeof r.date === 'string' && /^\d{2}-\d{2}$/.test(r.date)).map(r => r.date);
    const scopeRange = s.total === 0 ? '尚无记录' : markedDates.length
      ? markedDates[markedDates.length - 1] + ' 至 ' + markedDates[0] : '日期未记录';
    const topName = s.topKp ? s.topKp.name : '';
    const causeRows = (items, offset) => items.map((c, i) => {
      const max = s.causeMax || 1;
      const rank = offset + i + 1;
      return '<div class="cause-rank-row' + (rank === 1 ? ' is-top' : '') + '">' +
        '<span class="cr-no">' + rank + '</span>' +
        '<div class="cr-mid"><span class="cr-name" title="' + c.name + '">' + c.name + '</span>' +
        '<div class="cr-track"><div class="cr-fill" style="width:' + Math.round(c.count / max * 100) + '%"></div></div></div>' +
        '<span class="cr-count">' + c.count + ' 次</span></div>';
    }).join('');
    const firstRows = s.causeTop.length ? causeRows(s.causeTop, 0) : '<div class="cause-rank-row"><span class="cr-no">—</span><div class="cr-mid"><span class="cr-name">暂无错因</span><div class="cr-track"></div></div><span class="cr-count">0 次</span></div>';
    const remaining = s.causeStats.slice(5);
    const remainingRows = causeRows(remaining, s.causeTop.length);
    const highKp = s.kpHighest.length ? s.kpHighest.map(item => renderKpCell(item, topName, true)).join('') : '<p class="quiet lean-empty">暂无高频考点</p>';
    const toggle = s.causeCount > 5
      ? '<button class="more-causes" type="button" data-action="more-causes" aria-expanded="' + state.allCausesOpen + '">' +
          (state.allCausesOpen ? '收起其余错因' : '查看其余 ' + (s.causeCount - 5) + ' 种') + '</button>' : '';
    const allRows = state.allCausesOpen ? '<div class="cause-rank more-list" aria-label="其余具体错因">' + remainingRows + '</div>' : '';
    return '<div class="screen-pad lean-stats">' +
      (fixtureActive ? '<p class="lean-demo">演示数据 · ' + s.total + ' 道已保存题目 · ' + scopeRange + '</p>' : '<p class="lean-demo">已保存题目 · ' + scopeRange + '</p>') +
      '<section class="lean-overview"><h3>记录概览</h3><div class="lean-metrics">' +
        '<div><b>' + s.total + '</b><span>已保存题目</span></div><div><b>' + s.causeCount + '</b><span>具体错因种类</span></div>' +
      '</div></section>' +
      '<section class="lean-section"><div class="lean-heading"><h3>高频考点</h3><span>按题数</span></div><div class="card lean-kp">' + highKp + '</div></section>' +
      '<section class="lean-section"><div class="lean-heading"><h3>具体错因</h3><span>前 5 项</span></div>' +
        '<div class="cause-rank lean-causes" aria-label="具体错因排行">' + firstRows + '</div>' + toggle + allRows +
      '</section>' +
      '</div>';
  }

  function render() {
    phone.dataset.page = state.page;
    phone.dataset.fixture = state.fixture;
    phone.dataset.state = state.fixture === 'default' ? state.variant : state.fixture;
    phone.dataset.viewport = state.viewport;
    phone.classList.toggle('is-375', state.viewport === '375');
  document.body.classList.toggle('r3', state.fixture !== 'default');
    viewportNote.textContent = state.viewport === '375' ? '375 × 667 · 正常字号' : '390 × 844 · 正常字号';
    renderAppbar();
    renderTabbar();
    screen.innerHTML = state.page === 'stats' ? renderStats() : renderReport();
    restoreReadingPosition();
    const sc = screen;
    sc.style.overflowY = state.fixtureExpanded ? 'visible' : '';
    sc.style.height = state.fixtureExpanded ? 'auto' : '';
    sc.style.flex = state.fixtureExpanded ? 'none' : '';
    phone.style.height = state.fixtureExpanded ? 'auto' : '';
    document.querySelectorAll('#pageSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.page === state.page)));
    document.querySelectorAll('#stateSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === state.variant)));
    document.querySelectorAll('#viewportSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.viewport === state.viewport)));
    document.querySelectorAll('#fixtureSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fixture === state.fixture)));
    const note = document.getElementById('fixtureNote');
    const extra = document.getElementById('fixtureExtra');
    if (note) note.textContent = state.fixture === 'default' ? '默认合成 12 条记录／正式 50 节点' : (FIXTURE_NOTES[state.fixture] || '');
    if (extra) {
      let html = '';
      if (state.fixture === 'F3') html = '<span class="control-label">结构显示串：</span> ' + ['cases','recursive','root'].map(k => '<button type="button" class="mini-choice" data-f3="' + k + '" aria-pressed="' + (state.f3Variant === k) + '">' + F3_LABELS[k] + '</button>').join(' ');
      if (state.fixture === 'F7') html = '<span class="control-label">步骤：</span> ' + [['steps0','0 步'],['steps1','1 步'],['steps4','4 步']].map(([k,l]) => '<button type="button" class="mini-choice" data-f7steps="' + k + '" aria-pressed="' + (state.f7Steps === k) + '">' + l + '</button>').join(' ') + ' <button type="button" class="mini-choice" data-f7novariant="1" aria-pressed="' + state.f7NoVariants + '">无变式</button>';
      extra.innerHTML = html;
    }
  }

  function resetInteraction() {
    state.tab = 'steps';
    state.hints = {};
    state.details = {};
    state.solutionOpen = false;
    state.variantsOpen = {};
    state.expandedKp = {};
    state.allCausesOpen = false;
  }

  function resetNavigationTarget(page) {
    if (page === 'report' && ['S0','S1','S2','S50'].includes(state.fixture)) state.fixture = 'default';
    if (page === 'stats' && state.fixture !== 'default' && !['S0','S1','S2','S50'].includes(state.fixture)) state.fixture = 'default';
  }

  function showToast(message) {
    let el = phone.querySelector('.candidate-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'candidate-toast';
      el.setAttribute('role', 'status');
      phone.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  document.querySelectorAll('#pageSwitch button').forEach(btn => {
    btn.addEventListener('click', () => {
      readingAnchor = null;
      state.page = btn.dataset.page;
      resetNavigationTarget(state.page);
      resetInteraction();
      render();
    });
  });
  document.querySelectorAll('#stateSwitch button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.variant = btn.dataset.state;
      readingAnchor = null;
      resetInteraction();
      render();
    });
  });
  document.querySelectorAll('#viewportSwitch button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewport = btn.dataset.viewport;
      readingAnchor = null;
      render();
    });
  });

  document.getElementById('fixtureSwitch').addEventListener('click', e => {
    const btn = e.target.closest('[data-fixture]');
    if (!btn) return;
    readingAnchor = null;
    state.fixture = btn.dataset.fixture;
    if (['S0','S1','S2','S50'].includes(state.fixture)) state.page = 'stats';
    state.allCausesOpen = false;
    resetInteraction();
    render();
  });

  document.getElementById('fixtureExtra').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f3) state.f3Variant = b.dataset.f3;
    if (b.dataset.f7steps) state.f7Steps = b.dataset.f7steps;
    if (b.dataset.f7novariant) state.f7NoVariants = !state.f7NoVariants;
    render();
  });

  screen.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'tab') {
      readingAnchor = null;
      state.tab = el.dataset.tab;
      render();
      const tabs = screen.querySelector('.report-tabs');
      if (tabs) screen.scrollTop = Math.max(0, tabs.offsetTop - 8);
      return;
    }
    if (action === 'hint') {
      const i = Number(el.dataset.index);
      markReadingAnchor('hint', i);
      markReadingAnchor('hint', i);
      state.hints[i] = !state.hints[i];
      render();
      return;
    }
    if (action === 'detail') {
      const i = Number(el.dataset.index);
      markReadingAnchor('detail', i);
      markReadingAnchor('detail', i);
      state.details[i] = !state.details[i];
      render();
      return;
    }
    if (action === 'solution') {
      markReadingAnchor('solution', '');
      markReadingAnchor('solution', '');
      state.solutionOpen = !state.solutionOpen;
      render();
      return;
    }
    if (action === 'variant') {
      const i = Number(el.dataset.index);
      markReadingAnchor('variant', i);
      markReadingAnchor('variant', i);
      state.variantsOpen[i] = !state.variantsOpen[i];
      render();
      return;
    }
    if (action === 'branch') {
      const kp = el.dataset.kp;
      markReadingAnchor('branch', kp);
      markReadingAnchor('branch', kp);
      state.expandedKp[kp] = !state.expandedKp[kp];
      render();
      return;
    }
    if (action === 'more-causes') {
      markReadingAnchor('more-causes', '');
      state.allCausesOpen = !state.allCausesOpen;
      render();
      return;
    }
    if (action === 'again') {
      state.page = 'report';
      state.variant = 'short';
      resetInteraction();
      render();
      showToast('录入页不在本候选范围；这里回到有记录的报告示例。');
      return;
    }
    if (action === 'top') {
      readingAnchor = null;
      readingAnchor = null;
      screen.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (action === 'chat') {
      showToast('离线候选不发送追问，也不会调用模型。');
      return;
    }
    if (action === 'back') {
      showToast('返回录入页由原生页面处理；本候选只覆盖报告与学情。');
      return;
    }
    if (action === 'empty-cta') {
      showToast('录入页不在本候选范围；可切换到“有记录”查看报告示例。');
      return;
    }
  });

  tabbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const nav = btn.dataset.nav;
    readingAnchor = null;
    if (nav === 'stats') {
      readingAnchor = null;
      state.page = 'stats';
      resetNavigationTarget('stats');
      resetInteraction();
      render();
      return;
    }
    if (nav === 'home') {
      readingAnchor = null;
      state.page = 'report';
      resetNavigationTarget('report');
      resetInteraction();
      render();
      return;
    }
    showToast('本候选只覆盖诊断报告与学情分析。');
  });

  /* Optional deep links for review: index.html?page=stats&state=zero&viewport=375&tab=diagnosis&shot=1 */
  const params = new URLSearchParams(location.search);
  if (params.get('expand') === '1') state.fixtureExpanded = true;
  if (['default','F1','F2','F3','F4','F5','F6','F7','F8','S0','S1','S2','S50'].includes(params.get('fixture'))) state.fixture = params.get('fixture');
  if (['cases','recursive','root'].includes(params.get('f3'))) state.f3Variant = params.get('f3');
  if (Object.prototype.hasOwnProperty.call(R3_STEPS, params.get('steps'))) state.f7Steps = params.get('steps');
  if (params.get('noVariants') === '1') state.f7NoVariants = true;
  if (['S0','S1','S2','S50'].includes(state.fixture)) state.page = 'stats';
  if (params.get('fixture')) document.body.classList.add('r3');
  if (['report', 'stats'].includes(params.get('page'))) state.page = params.get('page');
  if (['short', 'long', 'zero', 'rule'].includes(params.get('state'))) state.variant = params.get('state');
  if (['375', '390'].includes(params.get('viewport'))) state.viewport = params.get('viewport');
  if (['steps', 'diagnosis', 'variants'].includes(params.get('tab'))) state.tab = params.get('tab');
  if (!params.get('page') && !params.get('state')) state.page = 'stats';
  if (params.get('shot') === '1') document.body.classList.add('shot-mode');
  if (params.get('solution') === '1') state.solutionOpen = true;
  if (params.get('hint') === '1') state.hints[0] = true;
  if (params.get('detail') === '1') state.details[0] = true;
  if (params.get('solved') === '1') state.solutionOpen = true;

  render();

  /* Read-only review hook for deterministic checks; it does not change page state. */
    window.__greenCandidate = {
    version: 'GREEN-R1-UI-R7-20261106',
    computeStats,
    makeStats,
    fixtureStats,
    nodeIds: NODES.map(n => n.id),
    kpOrder: KP_ORDER.slice(),
    categories: CATEGORIES.slice()
  };
})();


