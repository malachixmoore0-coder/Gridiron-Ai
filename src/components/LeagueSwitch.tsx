/**
 * The league picker: a bar of sports, and a drawer of leagues under it.
 *
 * The old version was a single pill that opened a modal sheet listing all
 * eighteen leagues at once. That worked at nine and stopped working at
 * eighteen — a wall of rows you had to read top to bottom to find the NBA.
 *
 * Sport is the choice people actually make first, so it goes in a bar that is
 * always visible: one tap says "basketball", the drawer opens underneath, and
 * a second tap says which basketball. Sports with only one league skip the
 * drawer entirely, because a one-row menu is a tap that buys nothing.
 *
 * Names are short — CFB, MCBB — everywhere except soccer, where eight
 * four-letter abbreviations would be a guessing game and the full names are
 * what anyone would recognise.
 *
 * The drawer is ordered by the calendar, not the registry: whatever is being
 * played today comes first. Opening Basketball in July and reading "NBA, out
 * of season" before the WNBA's live board is the wrong way round.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type as T } from '@/theme';
import { useLeague } from '@/league/LeagueContext';
import { SportGlyph } from '@/components/SportGlyph';
import { LEAGUES, inSeason, type LeagueMeta, type SportId } from '@/sports/types';
import { haptic } from '@/utils/haptics';

/** Sports in the order the bar shows them, with the leagues under each. */
function useSports(): { group: string; sport: SportId; leagues: LeagueMeta[] }[] {
  return useMemo(() => {
    const out: { group: string; sport: SportId; leagues: LeagueMeta[] }[] = [];
    for (const l of LEAGUES) {
      const hit = out.find((g) => g.group === l.group);
      if (hit) hit.leagues.push(l);
      else out.push({ group: l.group, sport: l.sport, leagues: [l] });
    }
    return out;
  }, []);
}

/** Soccer needs its full names; everything else is better short. */
const labelFor = (l: LeagueMeta) => (l.sport === 'soccer' ? l.name : l.short);

/** Games on the board, then in season, then the rest. */
const band = (l: LeagueMeta, games: number) => (games > 0 ? 0 : inSeason(l) ? 1 : 2);

export function LeagueSwitch() {
  const { league, setLeague, viewFor } = useLeague();
  const groups = useSports();
  const current = LEAGUES.find((l) => l.key === league) ?? LEAGUES[0];
  const [open, setOpen] = useState<string | null>(null);

  const pick = (l: LeagueMeta) => {
    haptic('medium');
    setLeague(l.key);
    setOpen(null);
  };

  const tapSport = (g: { group: string; leagues: LeagueMeta[] }) => {
    haptic('select');
    // One league means there is nothing to choose: go straight there.
    if (g.leagues.length === 1) { pick(g.leagues[0]); return; }
    setOpen((o) => (o === g.group ? null : g.group));
  };

  const drawer = groups.find((g) => g.group === open);

  // Sort is stable, so leagues sharing a band keep the registry's order and
  // only the calendar moves anything.
  const rows = useMemo(() => {
    if (!drawer) return [];
    return drawer.leagues
      .map((l) => {
        const view = viewFor(l.key);
        return { l, view, games: view.games.filter((x) => x.status !== 'final').length };
      })
      .sort((a, b) => band(a.l, a.games) - band(b.l, b.games));
  }, [drawer, viewFor]);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bar}
        contentContainerStyle={styles.barInner}
      >
        {groups.map((g) => {
          const here = g.group === current.group;
          const showing = g.group === open;
          const tone = here ? current.accent : colors.inkDim;
          return (
            <TouchableOpacity
              key={g.group}
              style={[styles.sport, here && { borderColor: tone, backgroundColor: colors.cardAlt }]}
              activeOpacity={0.85}
              onPress={() => tapSport(g)}
              accessibilityRole="button"
              accessibilityState={{ selected: here, expanded: showing }}
              accessibilityLabel={`${g.group}${here ? `, showing ${labelFor(current)}` : ''}`}
            >
              <SportGlyph sport={g.sport} size={15} color={tone} />
              <Text style={[styles.sportText, here && { color: tone }]} numberOfLines={1}>
                {/* The bar shows which league you are on, not just the sport —
                    otherwise "Basketball" tells you nothing about where you are. */}
                {here ? labelFor(current) : g.group}
              </Text>
              {g.leagues.length > 1 && (
                <Ionicons name={showing ? 'chevron-up' : 'chevron-down'} size={11} color={here ? tone : colors.inkGhost} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!!drawer && (
        <View style={styles.drawer}>
          {rows.map(({ l, view, games }) => {
            const on = l.key === league;
            return (
              <TouchableOpacity
                key={l.key}
                style={[styles.row, on && { borderColor: l.accent, backgroundColor: colors.cardAlt }]}
                activeOpacity={0.85}
                onPress={() => pick(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={l.name}
              >
                <Crest league={l} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, on && { color: l.accent }]} numberOfLines={1}>{labelFor(l)}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {l.kind === 'field' ? 'tournaments and the field'
                      : view.loading ? 'loading…'
                      : games > 0 ? `${games} game${games === 1 ? '' : 's'} on the board`
                      : inSeason(l) ? 'in season' : 'out of season'}
                  </Text>
                </View>
                {on && <Ionicons name="checkmark" size={16} color={l.accent} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** The league's crest where there is one, and its mark where there is not. */
function Crest({ league }: { league: LeagueMeta }) {
  const [failed, setFailed] = useState(false);
  if (league.logo && !failed) {
    return (
      <View style={styles.crestWrap}>
        <Image
          source={{ uri: league.logo }}
          style={styles.crest}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }
  return <SportGlyph sport={league.sport} size={19} color={league.accent} tile />;
}

const styles = StyleSheet.create({
  // flexShrink matters as much as flexGrow: a row in a flex column shrinks by
  // default, and a horizontal ScrollView clips what it cannot fit. The strip
  // was 26pt tall around a 47pt tab, so every label lost its second line and
  // the tabs disappeared under the card below. It is not the thing that gives
  // way when the column is short of room.
  bar: { flexGrow: 0, flexShrink: 0 },
  barInner: { gap: 6, alignItems: 'flex-start', paddingRight: spacing.lg },

  sport: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  sportText: { color: colors.inkDim, fontSize: 11.5, fontWeight: '800' },

  drawer: { marginTop: spacing.sm, gap: 5 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  rowName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowMeta: { color: colors.inkFaint, fontSize: 10.5, marginTop: 1 },
  crestWrap: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  crest: { width: 20, height: 20 },
});
