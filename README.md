# Gridiron AI 🏈

**An NFL bias & predictive analytics engine, fed by live data.** Pick any two
teams and Gridiron AI grades the matchup through four weighted analytical
nodes, simulates the game 10,000 times, and returns win probability, a
projected score and total, a 1-10 advantage matrix, a three-act game script and
a sleeper report — with every factor that moved the number laid out for you,
and the market line next to the model's.

The dataset behind it rebuilds itself on a schedule from public NFL data, so
ratings, depth charts, injuries, schedules, betting lines and kickoff weather
stay current without anyone touching a file.

## How the data stays live

```
 nflverse (play-by-play, schedule + lines, rosters, depth charts,
           injuries, snap counts, FTN charting, PFR advanced stats)
 ESPN injuries · Open-Meteo forecasts      (best-effort extras)
        │
        ▼   GitHub Action, every 3 h in-season (refresh-data.yml)
 pipeline/build.ts  ──►  data/live/{teams,schedule,meta}.json  ──►  commit
        │
        ▼
 web app rebuilt & published to GitHub Pages
        │
        ▼
 app fetches the newest JSON on launch (raw GitHub URL), caches it on-device,
 and falls back to the copy bundled at build time.
```

What gets computed on every refresh:

| Engine input | Source |
| --- | --- |
| Passing / rushing efficiency, explosiveness, success rate | EPA and yards per play from play-by-play |
| Pass-block & pass-rush win rates | Pressure-based proxies: (QB hits + sacks) ÷ dropbacks, per team and per player (PFR pressures) |
| Slot vs nickel, TE vs linebackers | EPA on short WR targets / on TE-and-RB targets, both sides of the ball |
| 3rd-down conversion & stop rates, 4th-down go rate, red-zone TD rate | Play-by-play down-and-distance |
| Play-action, motion, RPO and blitz rates | FTN charting joined to play-by-play |
| Halftime and secondary adjustments | 2nd-half minus 1st-half EPA margins, shrunk toward average |
| Offense vs 4-3 / 3-4 fronts | EPA split by the opponent's base front (from depth charts) |
| Base front, head coach | Depth-chart position group; schedule file |
| Depth charts, roles, snap shares | Latest team depth chart + snap counts |
| Player grades, target share, TPRR, PRWR | Position-relative percentiles of production; targets ÷ (dropbacks × snap share); pressures per game |
| Injury statuses | Official injury report (Out / Doubtful / Questionable) + roster reserve lists, ESPN as a fallback |
| Schedule, spreads, totals, moneylines, roofs, primetime | nflverse schedule file |
| Kickoff weather | Open-Meteo forecast for outdoor games inside the forecast window; observed temp/wind for finals |

**Blending.** Team metrics are `w · current season + (1 − w) · prior season`
with `w = games played ÷ (games played + 6)`, so Week 1 leans on last year and
the model converges on this year by mid-season. `meta.json` records the
weights, the sources that succeeded, and every proxy definition.

**Still curated by hand:** each defence's preferred coverage family (Cover-1 /
2 / 3 / Quarters / 2-Man), stadium noise, team colours and coordinates. They
live in `src/data/teams.ts`, which also serves as the fallback if the bundle is
ever missing.

## The analytical engine (`src/engine/`)

Every matchup is processed through four weighted nodes. Each node returns an
**edge** (−10 to +10, positive favours the home team) plus the list of factors
that produced it, and its weighted edge becomes points of projected margin.

| Node | Default weight | What it measures |
| --- | --- | --- |
| **Scheme & Tactical Bias** | 25% | Offense vs the *specific* front and base coverage it will see; play-action leverage vs the opponent's linebackers and blitz rate; passing and rushing efficiency against what the defence actually stops; 3rd-down success vs stop rate; 4th-down go rate, red-zone TD rate and aggressiveness; halftime and secondary adjustments. |
| **Personnel & Matchup Edge** | 35% | Quarterback; pass-block win rate vs pass-rush win rate in both directions; slot receiver vs nickel corner; TE speed vs linebackers; explosive plays vs takeaways; and the **injury degradation metric** — a backup QB costs −18% win efficiency, a missing LT −12% pass protection, an edge rusher −8%, and so on. |
| **Environmental & Rivalry** | 15% | Home-field advantage of 2.5–4.5 win-probability points scaled by stadium noise, travel distance, altitude and primetime; weather effects on the total and on the more pass-dependent team; division and rivalry variance. |
| **Sleeper & X-Factor** | 25% | Target share and targets-per-route-run projections, rotational pass-rusher snap % and PRWR, target-tree concentration, and mismatch sleepers. |

A seeded Monte-Carlo simulation (default **10,000 runs**, halves sampled
separately, overtime resolved) then produces the win probability & score
metric, the advantage matrix, the simulation narrative (early script, halftime
shifts, late-game clutch factor) and the 2-3 player sleeper report. Same
inputs always reproduce the same games; "Re-roll" draws a fresh seed.

## The app

- **Matchup** — defaults to this week's first game; pick any away @ home,
  toggle neutral site / primetime, choose weather (auto-filled from the
  forecast), see the reported injury report, and run. The market line and
  kickoff show for scheduled games.
- **Result** — everything above plus a model-vs-market comparison, each node's
  factor list, the injury degradation table, a margin histogram and the most
  likely finals.
- **Slate** — the real current-week schedule, each game quick-simulated with
  your model and compared to the market spread and total.
- **Teams** — all 32 with live scheme, front, coach and record; each team page
  shows the measured tendencies and unit grades feeding the nodes, and a depth
  chart with reported statuses you can override (Active → Questionable → Out →
  back to reported).
- **Model** — node weights, simulation count, base home-field edge, the injury
  metric table, and a live-data panel (source, freshness, blend, sources OK,
  manual refresh).

Nothing here is betting advice.

## Run it

```bash
npm install
npm run data:build        # pull live data → data/live/*.json (a minute or two)
npx expo start            # i / a / w for iOS, Android, web
```

```bash
npm run typecheck         # app + pipeline
npm run test:engine       # engine assertions, incl. the generated dataset
npm run data:build:offline   # skip Open-Meteo calls
```

Point the app at a different feed with `EXPO_PUBLIC_DATA_URL=https://…/data/live`.

## Deploy

Two workflows ship with the repo:

- **`refresh-data.yml`** — on a cron (every 3 h Sep–Feb, every 12 h otherwise)
  and on demand: rebuilds the dataset, runs the engine checks, commits
  `data/live/` if anything changed, rebuilds the web app and publishes it to
  GitHub Pages.
- **`deploy.yml`** — on pushes to `main` that touch app code: typecheck, engine
  checks, build, publish.

One-time setup in the repository: **Settings → Pages → Build and deployment →
Source: GitHub Actions** (the workflow also attempts to enable this itself).
The site then lives at `https://<owner>.github.io/<repo>/`. On a phone, **Add
to Home Screen** installs it full-screen with its own icon.

Native builds: `eas build --platform ios --profile preview`.

## Structure

```
├── .github/workflows/     refresh-data.yml · deploy.yml
├── data/live/             generated: teams.json · schedule.json · meta.json
├── pipeline/              the data build (Node 20, TypeScript)
│   ├── build.ts           orchestration, validation, writes data/live
│   ├── sources/           nflverse.ts (streamed pbp aggregator) · espn.ts · weather.ts
│   ├── compute/           teams.ts · players.ts · schedule.ts
│   └── lib/               fetch/cache/CSV streaming · math helpers
├── scripts/               engine-check.ts · make-icons.js
├── src/
│   ├── engine/            pure TypeScript engine (nodes, injuries, simulate, matrix, narrative)
│   ├── data/              teams.ts (curated baseline + fallback) · liveTypes.ts · slate.ts
│   ├── context/           TeamsContext (live data) · SettingsContext (weights, overrides)
│   ├── hooks/ components/ screens/ navigation/ theme.ts
└── App.tsx
```

Built with Expo + React Native + TypeScript. No backend, no accounts, no keys.
