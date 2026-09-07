# Gridiron AI 🏈

**One football model, two leagues, graded in public.** The NFL on Sunday and all
134 FBS programs on Saturday, in one app with one subscription. Pick any two
teams and Gridiron AI grades the matchup through four weighted analytical nodes,
simulates the game 10,000 times, and returns win probability, a projected score
and total, a 1-10 advantage matrix, a three-act game script and a sleeper report
— with every factor that moved the number laid out, and every sportsbook's line
next to the model's.

The datasets behind it rebuild themselves on a schedule from public data, so
ratings, depth charts, injuries, schedules, betting lines and kickoff weather
stay current without anyone touching a file. Live scores come straight from the
scoreboard, every twenty seconds, on top of that feed.

## How the app is put together

```
src/            the NFL league: engine, data, screens
src/cfb/        the college league: its own engine, data and screens
src/league/     the adapter both of them present to shared surfaces
src/live/       live-score polling that overlays the published feed
src/social/     profiles, follows, posts and tails
src/monetize/   one subscription ladder covering both leagues
```

Each league keeps its own engine and dataset — college football is not the NFL
with different logos, and pretending otherwise would ruin both models. What they
share is everything above the data: one theme, one tab bar, one card, one Parlay
Lab, one social graph, one price.

The college dataset is published by a companion repository
([CFB-Gridiron-AI](https://github.com/malachixmoore0-coder/CFB-Gridiron-AI)),
which still runs the college pipeline on its own schedule. This app reads both
feeds.

### Getting around

Five tabs — Floor, Slate, Record, Teams, Social — with an NFL/NCAA switch in
every header and Simulate as a floating action rather than a destination. Every
screen pushed on top of a tab carries a full-width **Back bar at the bottom** of
the screen, where a thumb actually reaches, and on the web the browser and phone
back gestures pop the stack too.

## How the data stays live

```
 nflverse (play-by-play, schedule + lines, rosters, depth charts,
           injuries, snap counts, FTN charting, PFR advanced stats)
 ESPN injuries · Open-Meteo forecasts      (best-effort extras)
        │
        ▼   GitHub Action, every 3 h in-season (refresh-data.yml)
 pipeline/build.ts  ──►  data/live/{teams,schedule,meta,predictions}.json
                          + data/live/rosters/*.json                  ──►  commit
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
- **Slate** — the whole season, one tab per week, opening on the current one.
  Within a week the games split into **Playing now** (live score and clock),
  **Upcoming** (model vs the market before kickoff) and **Final** (with whether
  the model called it), filtered by Division / Primetime / AFC / NFC.
- **Record** — the model's track record. Every refresh predicts each upcoming
  game with the default model and the market line at that moment; the
  prediction is rewritten until kickoff, then frozen, then graded when the
  final score lands: straight-up, against the spread, over/under, Brier score,
  margin and total error, and a calibration table. Graded, locked and open
  predictions are all listed. Nothing is back-filled — a game first seen after
  kickoff is never scored.
- **Teams** — all 32 with live scheme, front, coach and record. Each team gets
  its own scrolling page: identity and tendencies, the season schedule with
  results, the depth chart split into 1st / 2nd / 3rd string, the full roster by
  position group, and the ratings feeding the engine.
- **Box scores** — tap a played game on a team's schedule for its box score:
  the final, the model's verdict on that game, team totals for both sides, and
  passing / rushing / receiving / defense / kicking tables you can switch
  between the two teams. Tap any line for that player's profile. Tapping a game
  that has not kicked off yet opens the matchup preview instead.
- **Player profiles** — tap any player for his headshot (initials when the feed
  has no photo), jersey, experience, height and weight, college, depth and
  starting status, availability you can override, a grade with its basis,
  strengths and weaknesses as percentiles against every NFL player at his
  position, how he projects against the next opponent, season totals and a
  game-by-game log.
- **Model** — node weights, simulation count, base home-field edge, the injury
  metric table, and a live-data panel (source, freshness, blend, sources OK,
  manual refresh).

Nothing here is betting advice.

## Social, sign-in and privacy

Profiles, follows, posts with hashtags and GIFs, and **tails** — a tailed pick
lands on your own card and grades on the same finals as one you found yourself.
A shared pick always carries the model's probability and edge with it, so nobody
can post a screenshot of a winner they never had.

Privacy is two switches rather than one, because they answer different
questions: *show my record* is about the number, *show my picks* is about the
positions. A private account hides the picks from everyone but accepted
followers while the win/loss line can stay public.

**It runs device-local until a backend is connected**, and the app says so on
screen rather than implying an audience that is not there. To make it real:

1. Create a Supabase project, then run `docs/social-schema.sql` in its SQL
   editor — that file carries the tables, the counters and every row-level
   security policy the privacy switches promise.
2. Enable Google and Apple under Authentication → Providers.
3. Set the build-time variables:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_GIPHY_KEY=<optional, enables GIF search>
```

The anon key is meant to be public; everything that matters is enforced by the
policies, not by the client. Without a GIPHY key the picker still accepts a
pasted GIF link rather than showing a dead button.

## Sportsbooks

The refresh job pulls each game's provider list from ESPN's core API and
publishes it with the schedule, so the Parlay Lab can price a leg at a named
book — DraftKings, FanDuel, BetMGM, Caesars, ESPN BET — or shop every leg to
whichever book pays most under "best available". Where a book has not posted, the
field is left null rather than guessed: an invented half point is invented edge.

## Tiers, and turning payments on

Four tiers — Walk-On (free), Starter, All-Pro, Franchise — covering **both leagues**, defined in one place,
`src/monetize/tiers.ts`. Each is a set of entitlements (simulation depth, how far
down the Edge Board you can see, history, props, parlay legs, share cards), and
every gate in the app reads from that file, so changing the offer is a one-file
edit.

- The free tier is metered, not crippled: three simulations a day at 2,000 runs,
  the top three of the Edge Board, the whole slate and every box score.
- A 7-day All-Pro trial is offered in onboarding and on the wall. It takes no
  card and simply ends.
- The paywall's headline is the model's own graded record, computed live from
  `predictions.json`. Under ten graded games it says so instead of cherry-picking.

**Payments are Stripe Payment Links.** No server, no SDK, and no store cut on
the web build. Create one link per tier per cycle and set them as build-time
environment variables:

```
EXPO_PUBLIC_PAY_STARTER_MONTHLY=https://buy.stripe.com/...
EXPO_PUBLIC_PAY_STARTER_ANNUAL=...
EXPO_PUBLIC_PAY_ALLPRO_MONTHLY=...
EXPO_PUBLIC_PAY_ALLPRO_ANNUAL=...
EXPO_PUBLIC_PAY_FRANCHISE_MONTHLY=...
EXPO_PUBLIC_PAY_FRANCHISE_ANNUAL=...
EXPO_PUBLIC_BILLING_PORTAL=https://billing.stripe.com/p/login/...
```

Set the success URL on each link to `<site>/?upgraded=<tier>` and the app flips
over the moment the buyer lands back. Until the variables are set the wall still
sells — it records the intent rather than dead-ending on a broken button.

One thing stated plainly: **the gate is a product boundary, not a security
boundary.** The engine runs on the device and the dataset is a public repo, so a
determined user can read past it. Moving premium computation behind a licence
check is the next step on that road — see `docs/GROWTH.md`.

## The commercial plan

`docs/GROWTH.md` is the business half of this repo: the arithmetic to $10k a
month (≈490 subscribers at a $20 blended ARPU, not 50,000 users), why the ladder
is priced the way it is, the colour decisions and what job each one does, the
channels ranked by cost, the retention loops, a 90-day plan and the risks —
including the ones that are unflattering.

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
- **`refresh-scores.yml`** — every 20 minutes on game days: pulls the ESPN
  scoreboard and updates team records, finalises games on the slate and grades
  any prediction whose game just ended. It skips the rebuild entirely, so a
  final score lands in the app within minutes (`npm run data:scores`).
- **`deploy.yml`** — on pushes to `main` that touch app code: typecheck, engine
  checks, build, publish.

One-time setup in the repository: **Settings → Pages → Build and deployment →
Source: GitHub Actions** (the workflow also attempts to enable this itself).
The site then lives at `https://malachixmoore0-coder.github.io/Gridiron-Ai/`. On a phone, **Add
to Home Screen** installs it full-screen with its own icon.

Native builds: `eas build --platform ios --profile preview`.

## Structure

```
├── .github/workflows/     refresh-data.yml · deploy.yml
├── data/live/             generated: teams.json · schedule.json · meta.json · predictions.json (season track record)
│   └── rosters/           generated: one file per team (full roster, game logs, schedule)
├── pipeline/              the data build (Node 20, TypeScript)
│   ├── build.ts           orchestration, validation, writes data/live
│   ├── sources/           nflverse.ts (streamed pbp aggregator) · espn.ts · weather.ts
│   ├── compute/           teams.ts · rosters.ts · schedule.ts · predictions.ts (track record)
│   └── lib/               fetch/cache/CSV streaming · math helpers
├── scripts/               engine-check.ts · refresh-scores.ts · make-icons.js
├── src/
│   ├── engine/            pure TypeScript engine (nodes, injuries, simulate, matrix, narrative)
│   ├── data/              teams.ts (curated baseline + fallback) · liveTypes.ts · slate.ts
│   ├── context/           TeamsContext (live data) · SettingsContext (weights, overrides)
│   ├── hooks/ components/ screens/ navigation/ theme.ts
└── App.tsx
```

Built with Expo + React Native + TypeScript. No backend, no accounts, no keys.
