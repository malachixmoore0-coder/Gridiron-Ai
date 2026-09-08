/**
 * Moderation rules, asserted. Run with `npm run test:moderation`.
 *
 * The half that matters most is the "allows" block. A filter that blocks a slur
 * is easy; one that does not block "great analysis" or "Scunthorpe" while doing
 * it is the actual work, and those cases are the ones that regress silently
 * when somebody adds a fragment to a list.
 */
import { screen, qualityOf, rateLimited, RATE_LIMIT } from '@/social/moderation';

let fails = 0;
const t = (name: string, ok: boolean) => { console.log(`${ok ? '  ✓' : '  ✗'} ${name}`); if (!ok) fails += 1; };

console.log('blocks');
t('slur', screen('you absolute n1gger').verdict === 'block');
t('slur with spacing/punctuation', screen('f a g g o t').verdict === 'block');
t('threat', screen('kill yourself man').verdict === 'block');
t('tout: dm me for picks', screen('DM me for picks, $50/wk').verdict === 'block');
t('tout: guaranteed lock', screen('GUARANTEED LOCK tonight').verdict === 'block');
t('tout: vip group', screen('join the vip group').verdict === 'block');
t('scam: double your money', screen('double your money with me').verdict === 'block');
t('over length', screen('a'.repeat(501)).verdict === 'block');

console.log('allows — these must never be blocked');
t('ordinary pick post', screen('Taking NE +3.5 here, model has it 6.5 off the number.').verdict === 'allow');
t('criticism of a team', screen('That defense was absolutely terrible, worst I have seen all year').verdict === 'allow');
t('the word analysis (contains "anal")', screen('Great analysis on the trenches matchup').verdict === 'allow');
t('scunthorpe-ish', screen('Big game in Scunthorpe this weekend for the neutrals').verdict === 'allow');
t('lock as normal word', screen('They locked the game up in the fourth').verdict === 'allow');
t('mentions telegram once', screen('I posted the chart on telegram earlier').verdict !== 'block');

console.log('demotes, not blocks');
const links = screen('check http://a.com http://b.com http://c.com now');
t('three links demoted', links.verdict === 'demote' && links.codes.includes('link-spam'));
const shout = screen('THIS IS THE BIGGEST LOCK OF THE WEEKEND EVERYONE');
t('shouting scored down', shout.quality < 60 && shout.verdict !== 'block');
const tags = screen('nice #a #b #c #d #e #f #g');
t('tag stuffing scored down', tags.codes.includes('tag-stuffing'));

console.log('quality sort');
const good = qualityOf('Taking NE +3.5 — model has this 6.5 off the number and the board has not moved.', true);
const meh = qualityOf('lol', false);
t('substantive post outranks noise', good > meh);
t('pick adds signal', qualityOf('same text here for both cases ok', true) > qualityOf('same text here for both cases ok', false));

console.log('rate limit');
const now = Date.now();
t('under the limit passes', !rateLimited(Array.from({ length: RATE_LIMIT - 1 }, () => now)));
t('at the limit blocks', rateLimited(Array.from({ length: RATE_LIMIT }, () => now)));
t('old posts fall out of the window', !rateLimited(Array.from({ length: RATE_LIMIT }, () => now - 7_200_000)));

console.log(fails ? `\n${fails} FAILED` : '\nAll moderation checks passed.');
process.exit(fails ? 1 : 0);
