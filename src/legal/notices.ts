/**
 * What this product says about itself, in one place.
 *
 * The wording had drifted into claiming to be something it is not. Five
 * surfaces carried some version of "21+ where sports betting is legal", which
 * reads as the notice a sportsbook prints — and Simtoad is not one. It
 * takes no wager, holds no balance, settles nothing and pays nobody. It
 * publishes model projections and grades them in the open.
 *
 * That distinction is worth getting right in both directions. Overclaiming the
 * other way is the real risk in this category: a projection is not a tip, an
 * edge is not a guarantee, and a model that beat the market last month is not a
 * model that beats it next month. Those lines stay, everywhere, unchanged.
 *
 * The helpline stays too, and deliberately not as a compliance stamp. Plenty of
 * people reading a projection are also betting on it. Naming a free,
 * confidential resource costs nothing and is worth having in front of the one
 * person who needs it; framing it as a condition of use would just be a
 * gambling operator's boilerplate on a product that is not a gambling operator.
 *
 * Everything user-facing pulls from here so it cannot drift again.
 */

/** The core claim, and the one that must never soften. */
export const NOT_ADVICE = 'Projections are information, not advice.';

/** What this product is not. The line that replaced the 21+ boilerplate. */
export const NOT_A_BOOK = 'Simtoad does not take bets, hold funds or settle wagers.';

/** The honesty clause. No guaranteed-profit language, ever. */
export const NO_GUARANTEE = 'No model beats a sportsbook every week, and nothing here is a guarantee of profit.';

export const HELP_LINE = '1-800-GAMBLER';
export const HELP_URL = 'https://www.ncpgambling.org/help-treatment/';
export const HELP_NOTE = `If gambling is affecting your life, the National Council on Problem Gambling runs a free, confidential helpline: ${HELP_LINE}.`;

/** One line, for a screen footer that has no room for more. */
export const SHORT_NOTICE = `${NOT_ADVICE} ${NOT_A_BOOK}`;

/** The full disclosure, for Settings, the paywall and the landing page. */
export const FULL_NOTICE = `Simtoad publishes model projections and grades every one of them in the open. It is an information and analytics product: it does not accept wagers, hold funds or settle bets, and nothing here is a recommendation to place one. ${NO_GUARANTEE} ${HELP_NOTE}`;
