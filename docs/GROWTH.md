# Gridiron AI — the plan to $10k a month

One app, eighteen leagues across six sports, a calendar with no dead months,
and a social layer that turns every subscriber into a distribution channel. This document is
the commercial half of the build: what is being sold, to whom, at what price,
how they find it, and what has to be true for the number at the top to happen.

Everything here is written to be argued with. Where a number is a guess it says
so, and where the product has a real weakness it says that too.

**What changed in this version.** The app went from two football leagues to
eighteen leagues across six sports: the NFL and college football, the NBA,
WNBA, men's and women's college basketball, MLB, college baseball, the NHL,
eight soccer leagues — the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1,
the Champions League, Liga MX and MLS — and the PGA Tour. Three
commercial consequences follow, and they are the spine of everything below.

1. **The offseason cliff is gone, not shrunk.** Two football leagues covered
   August through February. Eighteen leagues cover every week of the year — MLB and
   MLS through the summer, basketball November to June, college baseball into
   the College World Series. The single largest cause of churn in the previous
   plan was a price that went dead for six months. It no longer does.
2. **The bundle became the product.** Nobody is being sold "an NFL app plus a
   college add-on". They are being sold a model that grades itself in public,
   pointed at whatever is playing tonight. That is a materially easier thing to
   subscribe to in April.
3. **Acquisition got cheaper per subscriber.** Eighteen leagues is eighteen
   sets of communities, subreddits, Discords and creators to reach, against one
   engineering surface. The marginal cost of the nineteenth league is a row in a
   table; the marginal audience is not. Soccer alone roughly doubles the
   addressable audience, and it is the one sport in the list where the
   competition is not already saturated with American-market products.

**What it does not change.** Football is still the anchor. It carries the
richest model — depth charts, snap counts, play-by-play — and the highest
willingness to pay. The seven new leagues are retention and reach, not a
replacement for the thing people arrive for.

---

## 1. What is actually being sold

Not picks. Picks are a commodity and the people selling them are mostly lying.

What is being sold is **a model that grades itself in public, and a place to be
right in front of other people**. Every projection is locked at kickoff, scored
against the final, and shown — wins, losses and the weeks it was wrong. That is
the moat. A tout can fake a record; an app that publishes a locked prediction
before kickoff and a graded result after cannot, and the Record tab is the proof.

The social layer is the second half of that. A pick posted from this app carries
the model's own probability and edge with it, and anyone can tail it into their
own card, where it grades on the same finals. Nobody can post a screenshot of a
winner they never had.

The three things a bettor pays for, in the order they will pay for them:

| They want | The feature | Tier |
|---|---|---|
| To stop guessing | Unlimited 10,000-run sims, the whole Edge Board, every league | Starter |
| To turn a number into a bet | Line shopping across books, Parlay Lab, props, Upset Radar | All-Pro |
| To be seen being right | A profile, a public record, followers and tails | Free, and it sells the tiers |
| To run it themselves | Raw feed, backtests, editable weights | Franchise |

---

## 2. The maths to $10,000 a month

**Prices.** Monthly $12.99 / $29.99 / $99. Annual $99 / $249 / $899. One
subscription covers every league — there is no per-sport SKU, because a price
that goes dead for six months is a price people cancel, and because nine
separate SKUs would triple the support load to capture the same wallet.

**What the expansion does to the annual plan.** The annual tier was previously a
hard sell against a six-month season: paying in September for a product that
goes quiet in March is a bad deal and buyers know it. With a year-round board
the annual price is now defensible on its own terms, and annual is where
retention actually lives. Expect the annual mix to be the single biggest
lever on the number below — push it and the churn assumption stops mattering.

**Blended ARPU.** Assume paying users split 60 / 33 / 7 across the three rungs:

```
0.60 × 12.99  =  7.79
0.33 × 29.99  =  9.90
0.07 × 99.00  =  6.93
                ------
blended monthly = 24.62
```

Assume 35% choose annual, which is roughly two months free, so multiply by 0.83:

**Effective ARPU ≈ $20.40 per paying user per month.**

**Subscribers needed:** `10,000 / 20.40` ≈ **490 paying subscribers**. Not 50,000
users. Four hundred and ninety people who bet on football and think $13 a month
is cheaper than one bad Sunday.

Merging the apps moves this number in two directions at once and both are good:
one funnel instead of two halves the marketing surface, and a subscriber who
uses the product from August to February churns later than one whose league went
away in January.

**Free users needed:** at a 4% free→paid conversion (achievable with a no-card
trial and a metered free tier; 2% is the pessimistic case):

| Conversion | Free users needed |
|---|---|
| 6% (good) | ~8,200 |
| 4% (plan) | ~12,300 |
| 2% (bad) | ~24,500 |

**Traffic needed:** at 25% visit→first-simulation, the 4% case needs ~49,000
visits across a season. Over a 22-week season that is **~2,200 visits a week**.
That is one short-form video a week that does 40k views, or two Reddit results
threads a month, or a single podcast read. It is a small number, and saying so
is the point: this does not need to go viral, it needs to not leak.

**Where it leaks:** every step above is a multiplication, so the cheapest wins
are the worst-performing step, not the top of the funnel. Instrument all four.

---

## 3. Pricing, and why it is shaped this way

- **Free is metered, not crippled.** Three simulations a day at 2,000 runs, the
  top three of the Edge Board, the whole slate, every box score. A free user can
  see that the model works, which is the only argument that converts.
- **The middle rung is the target.** All-Pro at $29.99 is where the tools live.
  Starter exists to make the meter go away for $12.99 — the easy yes — and
  Franchise at $99 exists mostly so All-Pro reads as reasonable. That is a
  decoy, and it is a legitimate one: Franchise is a real product for someone
  running a syndicate.
- **Annual is framed as months free, not a percentage.** "Two months free"
  outperforms "save 17%" because it is a unit people already own.
- **The trial takes no card.** Seven days of All-Pro, and it simply ends. A
  card-required trial converts better on paper and worse on refunds, reviews,
  and the one thing this product sells, which is trust.
- **The bundle.** Both apps for $39.99/mo or $299/yr. NFL runs September to
  February, college August to January — a bundle is the single cheapest way to
  lift ARPU and cut the offseason churn cliff at the same time. Build it as a
  shared entitlement code the moment either app has 100 paying users.

---

## 4. Colour, and why the app is green

This is a design decision with a commercial job, so it belongs in this document.

- **Dark ground.** Peak usage is 6pm–1am on a phone. A near-black ground cuts
  glare and lets one bright number own the screen. Every trading and betting app
  the audience already uses is dark; matching that lowers the cost of learning
  this one.
- **Green is money and only money.** Edge, profit, wins. Green reads as gain in
  every market app the audience has ever opened, and approach-motivation work
  (Elliot & Maier, 2014) ties green to go-signals and red to avoidance. Using it
  for decoration would spend that for nothing.
- **Gold is value.** Scarcity, trophies, the premium tier, the headline number.
  It marks what costs money.
- **Red is rationed.** Losses only. An app that flashes red at you is an app you
  stop opening in October.
- **60/30/10.** Sixty per cent ground, thirty per cent panel and ink, ten per
  cent accent. Accent that is everywhere is accent that is nowhere.

The two apps deliberately diverge in everything except that green law: the NFL
build is a cool near-black trading desk with tight tabular numbers, the college
build is a warm blackout gameday program with a serif masthead and ticket-stub
rows. Nobody should have to check which one they opened, and two distinct looks
means two distinct brands to market rather than one product in two skins.

---

## 5. Channels, cheapest first

**1. The record itself (owned, free).** Post the graded week every Tuesday: the
locked prediction, the final, the mark. Winning weeks sell; losing weeks build
the credibility that makes the winning weeks believable. Automate it off
`predictions.json` — the data is already published hourly.

**2. Short-form video (owned, ~1 hour a week).** One 20-second clip per slate:
three edges, the conviction bars, the market number, the model number. Vertical,
no face, no voice needed. This is what the Higgsfield tooling in this repo's
workflow is for. Post to TikTok, Reels and Shorts; the same clip is the paid ad
creative if paid ever makes sense.

**3. Reddit (owned, free, rules-bound).** r/sportsbook and team subs tolerate
results, not promotion. Post the graded record with no link in the body; the
profile carries the link. One thread a month, not one a week.

**4. The social graph (viral, built).** This is the change that matters most in
this version. Every pick posted in the app carries the model's numbers, and every
tail puts that pick on someone else's card. Three loops come out of it, in
increasing order of value:

  - **Share cards.** The Card screen still draws a 1080×1350 image of a user's
    record for the group chat.
  - **Tails.** A tailed pick is a position, not a like. It gives the tailer a
    reason to come back for the result and the poster a reason to post again.
  - **Public records.** A profile with a 61-49 line and a public card is the most
    persuasive advertisement this product can have, and it is written by users
    rather than by us.

Watch two numbers: posts per weekly active user, and the share→install rate. If
either clears 5%, this becomes channel one and the paid section below stays
permanently unnecessary.

**5. Podcasts and beat writers (paid in access, not cash).** `BEATWRITER` codes
give a year of All-Pro. A regional podcast with 4,000 listeners converts better
than a national one with 400,000 because the audience actually bets that team.
Offer 30% recurring on a referral code before offering cash.

**6. SEO (slow, compounding).** Every team page and every graded game is a page
worth indexing, but the app ships as a single-page bundle today so none of it is
indexable. Pre-rendering the team and record routes is the highest-value
non-feature on the roadmap.

**7. Paid.** Not yet. Do not buy traffic until the free→paid rate is measured
and above 3%, or the money is being spent to find out something the free
channels would have told you.

---

## 6. Retention, which is where the money actually is

At $20 ARPU, one month of extra average lifetime across 490 subscribers is
$10,000 a year. Retention beats acquisition at this size, and it is already
built:

- **Streak.** Counts attendance, not results, so it survives a bad week.
- **Your Card.** Saved picks graded off the same finals the model is graded on,
  with a flat-unit P&L. A record in progress is a reason to open the app that
  has nothing to do with whether anything shipped this week.
- **Badges.** Cheap, and they give a new user a first-week goal.
- **Follows.** A user with teams followed has a Tuesday reason to open.
- **The weekly grade.** The single highest-value unbuilt retention feature is a
  Tuesday push: "your card went 3-1, the model went 9-7." Build it next.

**The offseason cliff is closed.** There is no month without a live board:

| Months | What is playing |
|---|---|
| Sep–Jan | NFL, college football, NBA, NHL, both college basketball leagues, six soccer leagues, MLS, PGA |
| Feb–Mar | NBA, NHL, March Madness on both sides, European soccer run-in, MLS opens, college baseball opens |
| Apr–Jun | NBA/NHL/NCAA postseasons, MLB, college baseball to Omaha, the Champions League final, WNBA, three majors |
| Jul–Aug | MLB, WNBA, MLS, Liga MX, European leagues restart, the Open, then football camp |

Soccer is the quiet win here. Eight leagues playing from August to May, most of
them on Saturday and Sunday mornings US time, fills the exact hours American
sport does not — and the Champions League midweek fills the exact evenings a
Tuesday retention problem lives in.

March is now the strongest month in the calendar rather than a hole: two
sixty-eight team brackets, both of which are exactly the situation a
simulation-and-market product is built for, and the one time of year casual
bettors actively look for a model. Plan the acquisition spend around it.

The remaining risk is not seasonality, it is **thin ratings early in a season**.
A league four games in has a rating that is mostly prior, and the app says so
rather than printing a confident number over nothing — the result screen names
how many games sit behind the pairing and leans harder on the market until the
sample fills in. That honesty costs some conversions in October and is the
reason anyone will still be here in March.

---

## 7. Ninety days

**Weeks 1–2 — make it chargeable.** Create six Stripe Payment Links, set the env
vars, ship. Add analytics on four events: first sim, meter hit, wall viewed,
checkout opened. Nothing else matters until money can change hands.

**Weeks 3–4 — make it provable.** Automate the Tuesday results post from the
predictions file. Start the video clip habit. Get the first fifty free users
from people you can name.

**Weeks 5–8 — make it shareable.** Connect Supabase so sign-in, follows and
posts are real across devices rather than device-local (schema and policies are
already written — `docs/social-schema.sql`). Ship the weekly-grade notification
and the referral code (`give a week, get a week`). Measure posts per weekly
active user and share→install. Take the first three podcast partnerships with
BEATWRITER codes.

**Weeks 9–12 — make it defensible.** Move premium computation behind a licence
check (see Risks). Pre-render team and record pages for search. Ship the
two-app bundle. Review the funnel and put money into whichever step is leaking.

---

## 8. Risks, stated plainly

- **The gate is a product boundary, not a security boundary.** The engine runs
  on the device and the data feed is a public repository, so a determined user
  can read past the paywall. That is acceptable at launch and unacceptable at
  scale. The fix is a licence check on the premium feed and moving props,
  parlay pricing and the deep board server-side — planned, not done.
- **The social layer is device-local until Supabase is connected.** Everything
  works — posting, following, tailing, privacy — but on one phone, and the app
  says so on the screen rather than implying an audience that is not there. The
  schema, the row-level security policies and the client are all written; it is
  two environment variables and one SQL file away from being real.
- **Moderation is unbuilt.** The moment posts are shared between real accounts,
  somebody will post something that has to come down. Report, block and a delete
  path for an admin are the first three things to build after Supabase is live —
  before, not after, the first thousand users.
- **The model can be wrong for a month.** Variance is real, and the wall shows
  the record honestly, so a cold October will cost conversions. This is priced
  in deliberately: the alternative is hiding the record, which destroys the only
  durable asset the product has.
- **Regulatory.** This is information, not advice, and it must keep saying so.
  21+, no guaranteed-profit language ever, responsible-gambling messaging on
  every surface that shows a pick, and a rating that reflects the category. App
  store distribution of gambling-adjacent apps has real rules; the web build
  sidesteps most of them and also sidesteps the 30% cut, which is why the web
  build is the primary product.
- **Data dependency.** The feed is built from public sources on a schedule. If
  ESPN or nflverse changes shape mid-season the app degrades to cached data.
  Monitor the refresh workflow; a silent staleness bug is worse than an outage.
- **One person.** The whole thing is automated on GitHub Actions, which is the
  only reason 490 subscribers is servable by one person. Keep it that way:
  every feature that needs manual weekly work is a feature that ends the
  business.

---

## 9. What to measure

Six numbers, reviewed weekly:

1. Visits → first simulation (target 25%)
2. First simulation → trial started (target 30%)
3. Trial → paid (target 25%)
4. Monthly churn (target under 8%)
5. Effective ARPU (target $20)
6. Posts per weekly active user, and tails per post — the social layer either
   compounds or it is decoration, and this is the number that says which
7. The model's own ATS record — because it is the product, and it is the
   leading indicator of all six above.
