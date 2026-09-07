/**
 * Add to card.
 *
 * Saving a pick used to be possible in exactly one place — the Lock of the Day —
 * which made the card feel like something the app filled in for you rather than
 * something you built. This is the sheet that fixes it: every market on a game,
 * priced at whichever book you choose, with the model's probability next to each
 * one so the choice is informed rather than decorative.
 *
 * A saved pick carries the price it was taken at, so the card's units are the
 * units you would actually have won rather than a flat -110 assumption.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { useEngagement } from '@/context/EngagementContext';
import { haptic } from '@/utils/haptics';
import type { Market, PickSide } from '@/context/EngagementContext';
import { bestQuote, coverProb, fmtOdds, overProb, quotesFor, type BookQuote } from '@/utils/edge';
import type { LeagueGame, LeagueId, PredictionRecord } from '@/league/types';

interface Props {
  league: LeagueId;
  game: LeagueGame;
  rec: PredictionRecord | undefined;
  awayAbbr: string;
  homeAbbr: string;
  onClose: () => void;
}

interface Option {
  key: string;
  market: Market;
  side: PickSide;
  label: string;
  number: number | null;
  prob: number;
  odds: number | null;
  /** Model minus market on this side, in points. */
  edge: number;
}

/** Every market the model can price on one game, at one book's numbers. */
function optionsFor(game: LeagueGame, rec: PredictionRecord | undefined, q: BookQuote, awayAbbr: string, homeAbbr: string): Option[] {
  if (!rec) return [];
  const margin = rec.projectedHome - rec.projectedAway;
  const out: Option[] = [];
  const line = q.homeSpread ?? rec.marketHomeSpread;
  // The game's edge is how far the model's line sits from the market's, and it
  // is the same disagreement whichever side of that game you take.
  const gameEdge = line == null ? 0 : Math.abs(line - rec.spread);
  if (line != null) {
    const home = coverProb(margin, line);
    const edge = gameEdge;
    out.push({ key: 'spread:home', market: 'spread', side: 'home', label: `${homeAbbr} ${line > 0 ? `+${line}` : line}`, number: line, prob: home, odds: q.spreadHomeOdds ?? -110, edge });
    out.push({ key: 'spread:away', market: 'spread', side: 'away', label: `${awayAbbr} ${-line > 0 ? `+${-line}` : -line}`, number: line, prob: 1 - home, odds: q.spreadAwayOdds ?? -110, edge });
  }
  out.push({ key: 'ml:home', market: 'ml', side: 'home', label: `${homeAbbr} moneyline`, number: null, prob: rec.homeWinPct / 100, odds: q.homeMoneyline, edge: gameEdge });
  out.push({ key: 'ml:away', market: 'ml', side: 'away', label: `${awayAbbr} moneyline`, number: null, prob: rec.awayWinPct / 100, odds: q.awayMoneyline, edge: gameEdge });
  const total = q.totalLine ?? rec.marketTotal;
  if (total != null) {
    const over = overProb(rec.total, total);
    const edge = Math.abs(rec.total - total);
    out.push({ key: 'total:over', market: 'total', side: 'over', label: `Over ${total}`, number: total, prob: over, odds: q.overOdds ?? -110, edge });
    out.push({ key: 'total:under', market: 'total', side: 'under', label: `Under ${total}`, number: total, prob: 1 - over, odds: q.underOdds ?? -110, edge });
  }
  return out;
}

/** Expected value per $1 at the offered price, if the model is right. */
const evOf = (prob: number, odds: number | null) => {
  if (odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / -odds;
  return prob * payout - (1 - prob);
};

export function AddToCard({ league, game, rec, awayAbbr, homeAbbr, onClose }: Props) {
  const eng = useEngagement();
  const quotes = useMemo(() => quotesFor(game as never), [game]);
  const [bookKey, setBookKey] = useState<string>('best');
  const quote = useMemo(
    () => (bookKey === 'best' ? (quotes.length > 1 ? bestQuote(quotes) : quotes[0]) : quotes.find((q) => q.book === bookKey) ?? quotes[0]),
    [bookKey, quotes],
  );
  const options = useMemo(() => optionsFor(game, rec, quote, awayAbbr, homeAbbr), [game, rec, quote, awayAbbr, homeAbbr]);

  if (!rec) {
    return (
      <View style={styles.sheet}>
        <Text style={styles.title}>Add to card</Text>
        <Text style={styles.empty}>
          The model has not published a projection for this game yet — it prices games inside the ten-day window
          before kickoff. Come back closer to the day.
        </Text>
        <TouchableOpacity style={styles.close} activeOpacity={0.85} onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add to card</Text>
          <Text style={styles.sub}>{awayAbbr} at {homeAbbr} · {quote.name}</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={colors.inkFaint} />
        </TouchableOpacity>
      </View>

      {quotes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.books}>
          {[{ book: 'best', name: 'Best available' }, ...quotes].map((q) => {
            const on = bookKey === q.book;
            return (
              <TouchableOpacity
                key={q.book}
                style={[styles.book, on && styles.bookOn]}
                activeOpacity={0.85}
                onPress={() => { haptic('select'); setBookKey(q.book); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.bookText, on && styles.bookTextOn]}>{q.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {options.map((o) => {
        const saved = eng.hasPick(game.id, o.market, o.side);
        const ev = evOf(o.prob, o.odds);
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.row, saved && styles.rowSaved]}
            activeOpacity={0.85}
            onPress={() => {
              if (saved) return;
              haptic('success');
              eng.savePick({
                league,
                gameId: game.id,
                awayId: game.awayId,
                homeId: game.homeId,
                market: o.market,
                side: o.side,
                number: o.market === 'spread' ? quote.homeSpread ?? o.number : o.number,
                modelPct: o.prob * 100,
                edge: o.edge,
                label: o.label,
                book: quote.name,
                odds: o.odds,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={saved ? `${o.label} already on your card` : `Add ${o.label} to your card`}
          >
            <Ionicons
              name={saved ? 'checkmark-circle' : 'add-circle-outline'}
              size={19}
              color={saved ? colors.green : colors.inkFaint}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{o.label}</Text>
              <Text style={styles.meta}>
                model {(o.prob * 100).toFixed(0)}%
                {o.odds != null ? ` · ${fmtOdds(o.odds)}` : ''}
                {ev != null ? ` · EV ${(ev * 100).toFixed(1)}%` : ''}
              </Text>
            </View>
            <Text style={[styles.ev, numeric, { color: (ev ?? 0) > 0 ? colors.green : colors.inkGhost }]}>
              {ev == null ? '—' : `${ev > 0 ? '+' : ''}${(ev * 100).toFixed(0)}%`}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.foot}>
        Saved picks grade themselves off the final score, at the price you took. Positive EV means the model thinks
        this number is worth more than the book is charging for it — not that it will win.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderHi, padding: spacing.md, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  sub: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  empty: { color: colors.inkDim, fontSize: 12, lineHeight: 18, marginVertical: spacing.sm },
  close: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  closeText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  books: { gap: 6, paddingBottom: spacing.sm },
  book: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  bookOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  bookText: { color: colors.inkDim, fontSize: 11, fontWeight: '800' },
  bookTextOn: { color: colors.gold },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  rowSaved: { backgroundColor: colors.greenSoft, borderColor: colors.greenDim },
  label: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  ev: { fontSize: 13, fontWeight: '900' },

  foot: { color: colors.inkGhost, fontSize: 10, lineHeight: 15, marginTop: spacing.sm },
});
