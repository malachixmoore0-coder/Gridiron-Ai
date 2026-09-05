# Gridiron AI 🏈

**An NFL bias & predictive analytics engine in your pocket.** Pick any two
teams and Gridiron AI grades the matchup through four weighted analytical
nodes, simulates the game 10,000 times, and returns win probability, a
projected score and total, a 1-10 advantage matrix, a three-act game script and
a sleeper report — with every factor that moved the number laid out for you.

Gridiron AI is a standalone project: it shares no code, data or deployment
with anything else, and the whole folder can be moved into its own repository
as-is.

## What it does

### The analytical engine (`src/engine/`)

Every matchup is processed through four weighted nodes. Each node returns an
**edge** (−10 to +10, positive favours the home team) plus the list of factors
that produced it, and its weighted edge becomes points of projected margin.

| Node | Default weight | What it measures |
| --- | --- | --- |
| **Scheme & Tactical Bias** | 25% | Offense vs the *specific* front (4-3 / 3-4 / multiple) and base coverage (Cover-1 / 2 / 3 / Quarters / 2-Man) it will see; play-action leverage vs the opponent's linebackers and blitz rate; passing and rushing efficiency against what the defence actually stops; 3rd-down success vs the opponent's stop rate; 4th-down go rate, red-zone TD rate and aggressiveness; halftime and secondary adjustments. |
| **Personnel & Matchup Edge** | 35% | Quarterback; **pass-block win rate vs pass-rush win rate** in both directions; slot receiver vs nickel corner; TE speed vs linebackers; explosive plays vs takeaways; and the **injury degradation metric** — a backup QB costs −18% win efficiency, a missing LT −12% pass protection, an edge rusher −8%, and so on (full table in the app's Model tab). |
| **Environmental & Rivalry** | 15% | Home-field advantage of 2.5–4.5 win-probability points scaled by stadium noise, visitor travel distance, altitude and primetime; weather effects (wind / rain / snow / cold / heat / dome) on both the total and the more pass-dependent team; division and rivalry games raise variance and compress the spread. |
| **Sleeper & X-Factor** | 25% | Target share and targets-per-route-run projections, rotational pass-rusher snap % and PRWR, target-tree concentration, and mismatch sleepers (a slot receiver vs a soft nickel, a TE vs slow LBs, a rusher vs a backup LT). |

The four edges are summed into a **model margin**, an expected total is
derived from both offences, both defences, pace and weather, and then a
seeded Monte-Carlo simulation (default **10,000 runs**, first half and second
half sampled separately, overtime resolved) produces:

1. **Win probability & score metric** — win %, projected score, total, spread
   (with cover %), over %, one-score-game %, margin volatility.
2. **Advantage matrix** — 1-10 ratings for both teams across Passing, Rushing,
   Trench Play and Coaching, adjusted for the opponent they face.
3. **Simulation narrative** — an early-game script, halftime scheme shifts and
   the late-game clutch factor, all generated from the simulation statistics
   (who leads at half and how often, comeback rates, 4th-quarter one-score
   frequency, who has the 4th-down nerve, whose QB is the clutch tiebreaker).
4. **X-factor / sleeper report** — the 2-3 depth or rotational players most
   likely to move the spread, with a spread impact in points and a hit rate.

Simulations are **deterministic**: the same matchup, injury flags and model
settings always reproduce the same games. "Re-roll" draws a fresh seed.

### The app

- **Matchup** — pick away @ home from a division grid, swap sides, toggle
  neutral site / primetime, choose weather, see the injury report for both
  sides, and run the simulation. Recent matchups are one tap away.
- **Result** — everything above, plus each node's factor list (tap a node to
  expand), the injury degradation table, a margin histogram and the three most
  likely final scores.
- **Slate** — a curated sample board of marquee matchups, each quick-simulated
  (2,000 runs) with your current model and injury flags. Tap for the full run.
- **Teams** — all 32 teams with scheme, front, coverage and coach; each team
  page shows the coaching tendencies, offensive and defensive unit grades that
  feed the nodes, and a depth chart where you tap a player's status to cycle
  **Active → Questionable → Out**. Flags persist on-device and apply to every
  matchup that team plays.
- **Model** — edit the four node weights (auto-normalised to 100%), choose the
  simulation count (2k / 5k / 10k / 25k), set the base home-field edge, review
  the injury degradation metrics, clear all flags.

## It ships on sample data — on purpose

Team identities, divisions, stadiums and coordinates are factual. Every
rating, coaching tendency and depth chart in `src/data/teams.ts` is a
**preseason-2026 estimate** written to be realistic and internally consistent.
It is not a live feed, and it will drift from reality as rosters and results
change. Head coaches are listed only where the staff was settled when the
dataset was written.

Nothing here is betting advice.

### Bring your own data

The engine only ever sees plain `Team` objects (see `src/engine/types.ts`), so
swapping the sample dataset for a real one is a data problem, not a code
problem:

- **Edit in place.** Each team in `src/data/teams.ts` is a compact spec —
  scheme labels, 1-10 unit ratings, win rates as 0-1 fractions, and a
  `players` list of `[name, position, role, rating, snap%, { targetShare,
  tprr, prwr, pbwr, note }]` rows. Change a number, save, and every screen
  updates.
- **Wire a feed.** Build `Team[]` from your source (a stats API, a spreadsheet
  export, a scraper) and pass it to `analyzeMatchup()` — the app's `getTeam()`
  helper is the single place the UI looks teams up.
- **Schedule.** `src/data/slate.ts` is the curated sample board; replace it
  with the real week.

Run `npm run test:engine` after any data change — it asserts the whole league
still simulates within sane bounds and that player ids stay unique.

## Run it

```bash
cd Gridiron-AI
npm install
npx expo start
```

Press `i` for the iOS simulator, `a` for Android, or `w` for web — or scan the
QR code with the Expo Go app on your phone.

```bash
npm run typecheck     # strict TypeScript over the whole app
npm run test:engine   # deterministic engine sanity checks (no device needed)
```

## Build & deploy the web app

```bash
npx expo export --platform web      # static bundle in ./dist
npx serve dist                      # preview locally
```

`dist/` is a plain static site with a web manifest and home-screen icons, so
it can go anywhere: its own GitHub Pages repository, Netlify, Vercel, Cloudflare
Pages, an S3 bucket. It is built for a domain root by default; to host under a
sub-path set the base first:

```bash
EXPO_BASE_URL=/gridiron npx expo export --platform web
```

Once it's live, **Add to Home Screen** (Safari share sheet on iPhone, Chrome's
⋮ menu on Android) installs it full-screen with its own icon. Settings and
injury flags are stored in that browser's local storage.

To ship a native build instead:

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
```

## Structure

```
Gridiron-AI/
├── App.tsx
├── scripts/
│   ├── engine-check.ts        # npm run test:engine
│   └── make-icons.js          # regenerates assets/icon.png + public icons (pure Node)
├── src/
│   ├── engine/                # pure TypeScript, no React — usable anywhere
│   │   ├── types.ts           # Team, Player, MatchupInput, MatchupAnalysis, ...
│   │   ├── weights.ts         # 25/35/15/25 defaults, injury table, HFA bounds
│   │   ├── nodes.ts           # the four weighted nodes
│   │   ├── injuries.ts        # degradation metric → unit downgrades
│   │   ├── simulate.ts        # seeded 10,000-run Monte Carlo
│   │   ├── matrix.ts          # 1-10 advantage matrix
│   │   ├── narrative.ts       # three-act game script
│   │   ├── rng.ts / math.ts
│   │   └── index.ts           # analyzeMatchup()
│   ├── data/
│   │   ├── teams.ts           # 32-team sample dataset (editable)
│   │   └── slate.ts           # sample matchup board
│   ├── context/SettingsContext.tsx   # weights, sims, HFA, injury flags (persisted)
│   ├── hooks/useAnalysis.ts   # memoised engine runs for the UI
│   ├── components/            # TeamMark, ProbBar, MatrixRow, NodeCard, SleeperCard, ...
│   ├── screens/               # Matchup, Result, Slate, Teams, TeamDetail, Settings, Onboarding
│   ├── navigation/RootNavigator.tsx
│   └── theme.ts
└── public/                    # web manifest + home-screen icons
```

Built with Expo + React Native + TypeScript. No backend, no accounts, no
tracking.
