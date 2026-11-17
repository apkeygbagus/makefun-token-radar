// Token Launch Radar — token-radar-01 entry (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot (/input/snapshot.json or --input), finds the protocols that
// record no token yet, ranks them by the implied value of the launch they may one day make, and
// writes the hand-in: /output/board.json, the dashboard data (/output/data.js), a copy of
// dashboard/ and screenshots/, and /output/dossier.json built with vendor/makefun-board.ts.
//
// The model is this entry's own claim, stated in full so a reader can disagree with it:
//   implied value = TVL x category multiple x 7d-momentum factor x maturity factor.
// The board holds every watchlist protocol (the floor) plus the 180 largest clean pre-token
// protocols below the floor (the early radar). "Clean" repeats the watchlist's own hygiene at
// any size: no Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC /
// CEX category, no versioned name, no whole word wrapped/staked/staking, no exchange prefix —
// a wrapped or staked product of a token that already trades is not a launch that has not
// happened yet. Output is a pure function of the snapshot: two runs write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/* ---------------------------------- snapshot ---------------------------------- */

interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/* ----------------------------------- model ------------------------------------ */

/** What a launch is worth per $1 of TVL, by category: fee-dense, user-facing categories carry
 *  the richest multiples; passive yield plumbing the thinnest. */
const CATEGORY_MULTIPLE: Record<string, number> = {
  'Prediction Market': 1.8,
  Derivatives: 1.45,
  Dexs: 1.35,
  'Launchpad': 1.3,
  Lending: 1.05,
  CDP: 0.95,
  RWA: 0.9,
  'Onchain Capital Allocator': 0.85,
  'Liquidity Manager': 0.8,
  'Risk Curators': 0.8,
  'Basis Trading': 0.75,
  'Yield Aggregator': 0.7,
  'Leveraged Farming': 0.7,
  Yield: 0.62,
};
const DEFAULT_MULTIPLE = 0.85;

/** Categories that make a pre-token record a product of something else, not a future launch. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** How many early (below-floor) protocols the board adds under the watchlist floor. */
const EARLY_ROWS = 180;

function isPreToken(p: Proto): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** The watchlist's hygiene, applied at any TVL: not a derivative of a traded token. */
function isCleanLaunch(p: Proto): boolean {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name === e || p.name.startsWith(`${e} `))) return false;
  return true;
}

function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const ms = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : null;
}

/** A hot week lifts a launch's worth, a bleeding one discounts it; unreported means neutral. */
function momentumFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return Math.min(1.6, Math.max(0.75, 1 + change7d / 100));
}

/** Track record is worth something; a protocol listed last month has not earned a premium. */
function maturityFactor(age: number | null): number {
  if (age === null) return 0.95;
  if (age >= 720) return 1.1;
  if (age >= 365) return 1.05;
  if (age >= 180) return 1;
  if (age >= 90) return 0.95;
  return 0.9;
}

function impliedValue(p: Proto, age: number | null): { value: number; multiple: number } {
  const multiple = CATEGORY_MULTIPLE[p.category ?? ''] ?? DEFAULT_MULTIPLE;
  const raw = p.tvl_usd * multiple * momentumFactor(p.change_7d) * maturityFactor(age);
  return { value: Math.max(1, Math.round(raw)), multiple };
}

/** 0–100 radar score: how much farming effort a protocol deserves, not what it is worth.
 *  Depth 34, momentum 18, maturity 16, chain spread 12, category quality 12, watchlist 8. */
function radarScore(p: Proto, age: number | null, multiple: number, onWatchlist: boolean, maxTvl: number): number {
  const depth = maxTvl > 0 ? (34 * Math.log10(Math.max(1, p.tvl_usd))) / Math.log10(maxTvl) : 0;
  const chg = p.change_7d === null ? 0 : Math.min(30, Math.max(-20, p.change_7d));
  const momentum = ((chg + 20) / 50) * 18;
  const maturity = age === null ? 6 : Math.min(16, (age / 730) * 16);
  const spread = Math.min(12, p.chains.length * 3);
  const quality = Math.min(12, Math.max(2, multiple * 7));
  const listed = onWatchlist ? 8 : 0;
  return Math.round(Math.min(100, Math.max(0, depth + momentum + maturity + spread + quality + listed)));
}

function verdictFor(score: number): 'Watch' | 'Caution' | 'Skip' {
  if (score >= 75) return 'Watch';
  if (score >= 50) return 'Caution';
  return 'Skip';
}

/* --------------------------------- farm plans --------------------------------- */

function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

/** The one hands-on action per category group, in words a farmer can follow. */
function categoryAction(p: Proto): string {
  const c = (p.category ?? '').toLowerCase();
  const chain = p.chains[0] ?? 'its main chain';
  if (c.includes('dex') || c.includes('liquidity')) return `swap a small, regular volume through ${p.name}'s pools on ${chain} and, if you can, rest a little liquidity in its busiest pair`;
  if (c.includes('lending') || c.includes('cdp')) return `supply a blue-chip collateral asset on ${p.name} (${chain}) and keep one modest, well-collateralised borrow open so the position reads as real use`;
  if (c.includes('derivative') || c.includes('perpetual')) return `post a small USDC margin balance on ${p.name} and run one or two modest hedged trades a week rather than a single large one`;
  if (c.includes('prediction')) return `take small positions on ${p.name}'s most liquid markets on ${chain}, sized so a total loss is acceptable, and settle them as they resolve`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('basis') || c.includes('farming')) return `deposit a starter tranche into ${p.name}'s flagship vault on ${chain} and let it compound instead of hopping between vaults`;
  if (c.includes('rwa')) return `complete ${p.name}'s onboarding or KYC if it asks for it, then hold a small position in its flagship real-world-asset product on ${chain}`;
  return `use ${p.name}'s core product on ${chain} the way a genuine user would: small size, real transactions, repeated over weeks`;
}

/** Five steps, 20–600 characters each, built from the protocol's own record. */
function farmSteps(p: Proto, age: number | null, verdict: string): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chainList = p.chains.length > 1 ? `${p.chains.slice(0, 3).join(', ')}${p.chains.length > 3 ? ' and more' : ''}` : chain;
  const ageText = age === null ? 'DefiLlama gives no listing date for it' : `tracked by DefiLlama for about ${age} days`;
  const cadence = verdict === 'Watch' ? 'weekly' : verdict === 'Caution' ? 'every couple of weeks' : 'monthly, if at all';
  return [
    `Confirm the premise first: read ${p.name}'s own docs and announcements and check it still records no token; this board's snapshot has it token-less with ${money(p.tvl_usd)} of TVL.`,
    `Set up for ${chainList}: fund a fresh wallet on ${chain} with gas plus a working balance sized to what you can afford to lock up for months, not days.`,
    `Start the position: ${categoryAction(p)}; a ${p.category ?? 'DeFi'} protocol of this size (${money(p.tvl_usd)} TVL, ${ageText}) rewards steady use far more than one large deposit.`,
    `Keep a ${cadence} cadence: repeat the core action, claim any points or receipts it issues, and log every transaction so a later snapshot of your activity is easy to prove.`,
    `Manage the exit: cap your total exposure to ${p.name} at a fixed share of your farm budget, watch its official channels for a token or points announcement, and be ready to claim or unwind within the first day.`,
  ];
}

/* ----------------------------------- board ------------------------------------ */

interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d_pct: number | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  implied_multiple: number;
  radar_score: number;
  verdict: string;
  farm_steps: string[];
}

function buildBoard(snapshot: Snapshot): Row[] {
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, Proto>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !watch.has(p.slug) && isPreToken(p) && isCleanLaunch(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const maxTvl = Math.max(...[...chosen.values()].map((p) => p.tvl_usd));
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { value, multiple } = impliedValue(p, age);
    const score = radarScore(p, age, multiple, watch.has(p.slug), maxTvl);
    return { p, age, value, multiple, score };
  });
  scored.sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d_pct: s.p.change_7d,
    age_days: s.age,
    on_watchlist: watch.has(s.p.slug),
    implied_value_usd: s.value,
    implied_multiple: s.multiple,
    radar_score: s.score,
    verdict: verdictFor(s.score),
    farm_steps: farmSteps(s.p, s.age, verdictFor(s.score)),
  }));
}

/** Refuse a board the gate would refuse, in the program's own words, before writing anything. */
function boardIssue(rows: Row[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100..4000`;
  const slugs = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `row ${r.slug}: rank ${r.rank} at position ${i + 1}`;
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
    if (!(r.implied_value_usd > 0)) return `row ${r.slug}: implied value is not positive`;
    if (i > 0 && rows[i - 1]!.implied_value_usd < r.implied_value_usd) return `implied value rises at rank ${r.rank}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug}: ${r.farm_steps.length} farm steps`;
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${r.slug}: a farm step is ${len} characters`;
    }
  }
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `watchlist slug ${slug} is missing`;
  return null;
}

/** Compact dashboard data: rows as arrays, farm steps keyed by slug. */
function dataScript(rows: Row[], snapshot: Snapshot): string {
  const steps: Record<string, string[]> = {};
  for (const r of rows) steps[r.slug] = r.farm_steps;
  const data = {
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    cols: ['rank', 'slug', 'name', 'category', 'chains', 'tvlUsd', 'change7dPct', 'ageDays', 'impliedValueUsd', 'impliedMultiple', 'radarScore', 'verdict', 'onWatchlist'],
    rows: rows.map((r) => [r.rank, r.slug, r.name, r.category, r.chains, r.tvl_usd, r.change_7d_pct, r.age_days, r.implied_value_usd, r.implied_multiple, r.radar_score, r.verdict, r.on_watchlist ? 1 : 0]),
    steps,
  };
  return `window.RADAR=${JSON.stringify(data)};\n`;
}

/* ------------------------------------ main ------------------------------------ */

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
const rows = buildBoard(snapshot);
const issue = boardIssue(rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(rows, snapshot));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

const watch = rows.filter((r) => r.verdict === 'Watch').length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${rows.length} rows scored (${watch} Watch)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
