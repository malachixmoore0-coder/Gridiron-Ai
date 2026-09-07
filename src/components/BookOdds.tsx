/**
 * Every sportsbook's number on one game, and what each of them implies.
 *
 * The point of showing more than one book is not completeness, it is the gap:
 * a half point of spread and ten cents of juice is the difference between a bet
 * worth making and one that is not, and the only way to see it is side by side.
 *
 * Each row carries the book's own de-vigged implied probability next to the
 * model's. Removing the vig matters — a raw -110/-110 pair adds up to 105%, and
 * comparing a model's 55% against an inflated 52.4% flatters the model. The
 * numbers here are what the book actually thinks, normalised to 100.
 *
 * A note on the marks: these are colour-and-wordmark chips drawn by us, not the
 * books' logo files. Their logos are trademarks, and shipping the real artwork
 * is something to do through an affiliate agreement and their media kit, not by
 * hotlinking. Swapping these chips for official assets later is a one-file
 * change — see BOOKS below.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, numeric, radius, spacing } from '@/theme';
import { devig, fmtOdds, quotesFor, type BookQuote } from '@/utils/edge';
import type { LeagueGame, PredictionRecord } from '@/league/types';

/** Brand colours and short marks, keyed by the slug the feed publishes. */
export const BOOKS: Record<string, { short: string; bg: string; fg: string }> = {
  draftkings: { short: 'DK', bg: '#53D337', fg: '#04140A' },
  fanduel:    { short: 'FD', bg: '#1493FF', fg: '#03121F' },
  betmgm:     { short: 'MGM', bg: '#C0A15A', fg: '#161005' },
  caesars:    { short: 'CZR', bg: '#C8B273', fg: '#171204' },
  espnbet:    { short: 'ESPN', bg: '#FFC400', fg: '#151000' },
  bet365:     { short: '365', bg: '#0F7A55', fg: '#EAF6F0' },
  pointsbet:  { short: 'PB', bg: '#E4002B', fg: '#FFF0F2' },
  betrivers:  { short: 'BR', bg: '#0072CE', fg: '#EAF3FC' },
  fanatics:   { short: 'FAN', bg: '#0A2A5E', fg: '#E8EEF8' },
  hardrock:   { short: 'HR', bg: '#7A1533', fg: '#F7E9ED' },
  consensus:  { short: 'AVG', bg: '#22303F', fg: '#9FB1C2' },
};

const fallback = (name: string) => ({
  short: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || '—',
  bg: colors.cardHi,
  fg: colors.inkDim,
});

export function BookChip({ book, name, size = 'md' }: { book: string; name: string; size?: 'sm' | 'md' }) {
  const b = BOOKS[book] ?? fallback(name);
  const small = size === 'sm';
  return (
    <View style={[styles.chip, small && styles.chipSm, { backgroundColor: b.bg }]} accessibilityLabel={name}>
      <Text style={[styles.chipText, small && styles.chipTextSm, { color: b.fg }]}>{b.short}</Text>
    </View>
  );
}

/** Implied home win probability with the vig removed, when both prices exist. */
function impliedHome(q: BookQuote): number | null {
  if (q.homeMoneyline == null || q.awayMoneyline == null) return null;
  return devig(q.awayMoneyline, q.homeMoneyline).home * 100;
}

interface Props {
  game: LeagueGame;
  rec: PredictionRecord | undefined;
  awayAbbr: string;
  homeAbbr: string;
}

export function BookOdds({ game, rec, awayAbbr, homeAbbr }: Props) {
  const quotes = quotesFor(game as never);
  const modelHome = rec ? rec.homeWinPct : null;
  const only = quotes.length === 1 && quotes[0].book === 'consensus';

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.h, styles.hBook]}>BOOK</Text>
        <Text style={[styles.h, styles.hCol]}>{homeAbbr} SPREAD</Text>
        <Text style={[styles.h, styles.hCol]}>TOTAL</Text>
        <Text style={[styles.h, styles.hCol]}>{homeAbbr} ML</Text>
        <Text style={[styles.h, styles.hPct]}>IMPLIED</Text>
      </View>

      {quotes.map((q) => {
        const imp = impliedHome(q);
        const gap = imp != null && modelHome != null ? modelHome - imp : null;
        return (
          <View key={q.book} style={styles.row}>
            <View style={styles.bookCell}>
              <BookChip book={q.book} name={q.name} size="sm" />
              <Text style={styles.bookName} numberOfLines={1}>{q.name}</Text>
            </View>
            <Text style={[styles.cell, numeric]}>
              {q.homeSpread == null ? '—' : q.homeSpread > 0 ? `+${q.homeSpread}` : q.homeSpread}
              {q.spreadHomeOdds != null && <Text style={styles.juice}> {fmtOdds(q.spreadHomeOdds)}</Text>}
            </Text>
            <Text style={[styles.cell, numeric]}>
              {q.totalLine == null ? '—' : q.totalLine}
              {q.overOdds != null && <Text style={styles.juice}> {fmtOdds(q.overOdds)}</Text>}
            </Text>
            <Text style={[styles.cell, numeric]}>{q.homeMoneyline == null ? '—' : fmtOdds(q.homeMoneyline)}</Text>
            <View style={styles.pctCell}>
              <Text style={[styles.pct, numeric]}>{imp == null ? '—' : `${imp.toFixed(0)}%`}</Text>
              {gap != null && Math.abs(gap) >= 1 && (
                <Text style={[styles.gap, numeric, { color: gap > 0 ? colors.green : colors.negative }]}>
                  {gap > 0 ? '+' : ''}{gap.toFixed(0)}
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {modelHome != null && (
        <View style={[styles.row, styles.modelRow]}>
          <View style={styles.bookCell}>
            <View style={[styles.chip, styles.chipSm, { backgroundColor: colors.green }]}>
              <Text style={[styles.chipText, styles.chipTextSm, { color: colors.bg }]}>AI</Text>
            </View>
            <Text style={[styles.bookName, { color: colors.green }]}>The model</Text>
          </View>
          <Text style={[styles.cell, numeric]}>{rec!.spread > 0 ? `+${rec!.spread.toFixed(1)}` : rec!.spread.toFixed(1)}</Text>
          <Text style={[styles.cell, numeric]}>{rec!.total.toFixed(1)}</Text>
          <Text style={[styles.cell, numeric]}>—</Text>
          <View style={styles.pctCell}><Text style={[styles.pct, numeric, { color: colors.green }]}>{modelHome.toFixed(0)}%</Text></View>
        </View>
      )}

      <Text style={styles.foot}>
        {only
          ? 'One line on file for this game. Per-book prices arrive with the next data refresh, and the model column is already comparable.'
          : `Implied is each book's own number with the vig removed, so it adds to 100 across the two sides. The green figure is how far the model sits from that book on ${homeAbbr}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  h: { color: colors.inkFaint, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  hBook: { flex: 1.7 },
  hCol: { flex: 1, textAlign: 'right' },
  hPct: { flex: 1, textAlign: 'right' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.divider },
  modelRow: { borderTopColor: colors.greenDim },
  bookCell: { flex: 1.7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookName: { color: colors.inkDim, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  cell: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  juice: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
  pctCell: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 },
  pct: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  gap: { fontSize: 10, fontWeight: '900' },

  chip: { minWidth: 34, paddingHorizontal: 6, height: 22, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chipSm: { minWidth: 30, height: 19, borderRadius: 5 },
  chipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  chipTextSm: { fontSize: 9 },

  foot: { color: colors.inkGhost, fontSize: 10, lineHeight: 14, marginTop: 8 },
});
