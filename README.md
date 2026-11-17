[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/apkeygbagus/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/apkeygbagus/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar — make.fun "Build the best token launch radar"

Bounty: https://make.fun/bounty/token-radar-01
Slug: `token-radar-01` · Pool $1,325 USDC (1st $1,000) · **Deadline: 2026-12-14 10:00 UTC = 17:00 WIB** · Entry fee: none (verified via the competition requirements API).

## What this entry does

Reads the sealed DefiLlama snapshot from the competition kit (758 protocols, fetched 2026-11-14), finds the protocols that record **no token yet**, and ranks them by the **implied value** of the launch they may one day make — plus a concrete farm plan for every row.

- **Board: 198 rows.** All 40 protocols on the snapshot's own watchlist (the floor), plus the 158 largest clean pre-token protocols below the floor (the early radar). "Clean" repeats the watchlist's hygiene at any size: no Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX category, no versioned name, no whole word *wrapped/staked/staking*, no exchange name prefix — a wrapped or staked product of a token that already trades is not a launch that has not happened yet.
- **Model (this entry's own claim):** `implied value = TVL × category multiple (0.62–1.80) × 7d-momentum factor (0.75–1.60) × maturity factor (0.90–1.10)`. Radar score (farming priority, 0–100) = TVL depth 34 · momentum 18 · maturity 16 · chain spread 12 · category quality 12 · watchlist 8. Verdicts: **Watch ≥ 75 · Caution 50–74 · Skip < 50** → 8 Watch / 135 Caution / 55 Skip.
- **Dashboard:** fully offline static page — ranked board, search + verdict/category/chain filters, sorting, and a detail view per protocol (implied value, risk bars, why this verdict, the same farm plan as `board.json`). Deep links: `#protocol=<slug>` opens a detail, `#verdict=Watch` starts filtered.

## Entry format (from the official kit)

- Public GitHub repo, OSI license (MIT, see `LICENSE`), program at **`main.ts`** (Node 22, standard library only) in the root.
- `vendor/makefun-board.ts` — the kit's vendored library, byte-identical to the kit (sha256 `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`); `main.ts` uses its `buildDossier` to write `dossier.json`.
- The program reads `/input/snapshot.json`, writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`. Two runs write identical bytes (verified).

## Run it

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
# then open out/dashboard/index.html in a browser (no server, no network)
```

## Files

| Path | Role |
|---|---|
| `main.ts` | The program: snapshot → model → board.json + data.js + dossier.json |
| `vendor/makefun-board.ts` | Kit library (dossier builder), unmodified |
| `dashboard/` | index.html + style.css + app.js — the offline dashboard (16.9 KB of source) |
| `screenshots/` | 1-board.png · 2-detail.png · 3-filtered.png — real renders of this dashboard |
| `.makefun/owner.json` | Repo ownership claim for the entrant's make.fun account wallet |

Built by an AI agent (Muse Spark, Muse app sessions) for the token-radar-01 bounty.
