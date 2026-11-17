// Token Launch Radar dashboard — renders window.RADAR (written by main.ts beside this page).
// No network, no framework: the board, a detail view per protocol, and filters.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var C = {};
  D.cols.forEach(function (name, i) { C[name] = i; });
  var rows = D.rows.map(function (r) {
    var o = {};
    D.cols.forEach(function (name, i) { o[name] = r[i]; });
    o.chains = o.chains || [];
    return o;
  });

  function $(id) { return document.getElementById(id); }
  function money(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v;
  }
  function pct(v) { return v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }
  function ageText(d) {
    if (d === null || d === undefined) return '—';
    if (d >= 730) return (d / 365).toFixed(1) + 'y';
    if (d >= 60) return Math.round(d / 30.4) + 'mo';
    return d + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* header + stats */
  $('snapDate').textContent = D.asOf;
  $('snapSrc').textContent = D.source.replace(/^DefiLlama /, 'DefiLlama · ');
  var watchCount = rows.filter(function (r) { return r.verdict === 'Watch'; }).length;
  var wlRows = rows.filter(function (r) { return r.onWatchlist === 1; }).length;
  var totalImplied = rows.reduce(function (a, r) { return a + r.impliedValueUsd; }, 0);
  var scores = rows.map(function (r) { return r.radarScore; }).sort(function (a, b) { return a - b; });
  var median = scores[Math.floor(scores.length / 2)] || 0;
  var stats = [
    [D.protocols, 'protocols tracked'],
    [rows.length, 'pre-token on board'],
    [wlRows + ' / ' + D.watchlist, 'watchlist covered'],
    [watchCount, 'Watch verdicts'],
    [money(totalImplied), 'aggregate implied value'],
    [median, 'median radar score'],
  ];
  $('stats').innerHTML = stats.map(function (s) {
    return '<div class="stat"><div class="v">' + s[0] + '</div><div class="k">' + s[1] + '</div></div>';
  }).join('');

  /* filter option lists */
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  $('fCat').innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');
  $('fChain').innerHTML = '<option value="">All chains</option>' + Object.keys(chains).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');

  var state = { q: '', verdict: 'All', cat: '', chain: '', sort: 'rank' };
  var selected = null;

  function visible() {
    var q = state.q.toLowerCase();
    var list = rows.filter(function (r) {
      if (state.verdict !== 'All' && r.verdict !== state.verdict) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ') + ' ' + r.slug).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'rank') return a.rank - b.rank;
      var av = a[key] === null ? -Infinity : a[key];
      var bv = b[key] === null ? -Infinity : b[key];
      return bv - av || a.rank - b.rank;
    });
    return list;
  }

  function scoreColor(s) { return s >= 75 ? 'var(--watch)' : s >= 50 ? 'var(--caution)' : 'var(--skip)'; }

  function render() {
    var list = visible();
    $('rowCount').textContent = list.length + ' of ' + rows.length + ' protocols';
    $('empty').hidden = list.length > 0;
    $('tbody').innerHTML = list.map(function (r) {
      var chg = r.change7dPct;
      var cls = chg === null ? '' : chg >= 0 ? 'up' : 'down';
      var chainText = r.chains.length <= 2 ? r.chains.join(', ') : r.chains[0] + ' +' + (r.chains.length - 1);
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td class="pname">' + esc(r.name) + (r.onWatchlist === 1 ? ' ★' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(chainText) + '</td>' +
        '<td class="r">' + money(r.tvlUsd) + '</td>' +
        '<td class="r ' + cls + '">' + pct(chg) + '</td>' +
        '<td class="r">' + ageText(r.ageDays) + '</td>' +
        '<td class="r"><b>' + money(r.impliedValueUsd) + '</b></td>' +
        '<td class="r">' + r.impliedMultiple.toFixed(2) + '×</td>' +
        '<td><span class="scorebar"><span class="bar"><i style="width:' + r.radarScore + '%;background:' + scoreColor(r.radarScore) + '"></i></span>' + r.radarScore + '</span></td>' +
        '<td><span class="badge ' + r.verdict + '">' + r.verdict + '</span></td></tr>';
    }).join('');
    Array.prototype.forEach.call($('tbody').querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function bar(label, val) {
    return '<div class="risk"><label>' + label + '</label><span class="bar"><i style="width:' +
      Math.max(2, Math.min(100, val)) + '%;background:var(--acc)"></i></span><b>' + Math.round(val) + '</b></div>';
  }

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    selected = slug;
    var maxLog = Math.log10(Math.max.apply(null, rows.map(function (x) { return x.tvlUsd; })));
    var depth = (Math.log10(Math.max(1, r.tvlUsd)) / maxLog) * 100;
    var momentum = r.change7dPct === null ? 50 : Math.max(0, Math.min(100, 50 + r.change7dPct * 2.5));
    var maturity = r.ageDays === null ? 25 : Math.min(100, (r.ageDays / 730) * 100);
    var spread = Math.min(100, r.chains.length * 25);
    var why = r.verdict === 'Watch'
      ? 'Deep TVL, a live growth record and a category whose launches price richly: the implied value covers a serious farm budget many times over.'
      : r.verdict === 'Caution'
        ? 'A real protocol with a real record, but thinner depth or momentum: worth a passive position, not a dedicated wallet.'
        : 'Thin depth, a fading record or a low-multiple category: the implied value does not cover the gas and time a farm would cost.';
    var steps = (D.steps[slug] || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detailBody').innerHTML =
      '<h2>' + esc(r.name) + (r.onWatchlist === 1 ? ' ★' : '') + '</h2>' +
      '<p class="meta">#' + r.rank + ' on the board · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || '—') +
      (r.onWatchlist === 1 ? ' · on the snapshot watchlist' : ' · early find below the watchlist floor') + '</p>' +
      '<div class="kv">' +
      '<div><b>' + money(r.impliedValueUsd) + '</b><span>Implied value</span></div>' +
      '<div><b>' + money(r.tvlUsd) + '</b><span>TVL</span></div>' +
      '<div><b>' + r.impliedMultiple.toFixed(2) + '×</b><span>Category multiple</span></div>' +
      '<div><b>' + pct(r.change7dPct) + '</b><span>TVL change 7d</span></div>' +
      '<div><b>' + ageText(r.ageDays) + '</b><span>Age tracked</span></div>' +
      '<div><b>' + r.radarScore + ' · ' + r.verdict + '</b><span>Radar score</span></div>' +
      '</div>' +
      '<h3>Risk bars</h3>' +
      bar('Depth', depth) + bar('Momentum', momentum) + bar('Maturity', maturity) + bar('Chain spread', spread) +
      '<h3>Why this verdict</h3><p>' + why + '</p>' +
      '<h3>Farm plan</h3><ol class="farm">' + steps + '</ol>';
    $('detail').hidden = false;
    render();
  }

  $('closeDetail').addEventListener('click', function () {
    $('detail').hidden = true;
    selected = null;
    render();
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  $('fCat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  $('fChain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('fSort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  Array.prototype.forEach.call($('verdictChips').querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      Array.prototype.forEach.call($('verdictChips').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
      chip.classList.add('on');
      state.verdict = chip.getAttribute('data-v');
      render();
    });
  });

  render();

  /* Deep links: #verdict=Watch starts filtered, #protocol=<slug> opens that protocol's detail. */
  var hash = {};
  String(window.location.hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2) hash[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
  });
  if (hash.verdict && hash.verdict !== 'All') {
    Array.prototype.forEach.call($('verdictChips').querySelectorAll('.chip'), function (c) {
      var on = c.getAttribute('data-v') === hash.verdict;
      c.classList.toggle('on', on);
      if (on) state.verdict = hash.verdict;
    });
    render();
  }
  if (hash.protocol) openDetail(hash.protocol);
})();
