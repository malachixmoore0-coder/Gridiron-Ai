import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DIVISIONS } from '@/data/teams';
import { colors, radius, spacing } from '@/theme';
import { useSettings } from '@/context/SettingsContext';
import { TeamMark } from '@/components/TeamMark';
import { ScreenHeader } from '@/components/ScreenHeader';

interface Props { onOpenTeam: (id: string) => void; }

export function TeamsScreen({ onOpenTeam }: Props) {
  const { injuredOut, questionable, clearInjuries } = useSettings();
  const flaggedCount = injuredOut.length + questionable.length;
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="Teams"
        subtitle="Scheme profiles, unit grades & injury report"
        right={flaggedCount > 0 ? (
          <TouchableOpacity style={styles.clear} onPress={clearInjuries}>
            <Text style={styles.clearText}>Clear {flaggedCount} flag{flaggedCount === 1 ? '' : 's'}</Text>
          </TouchableOpacity>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {DIVISIONS.map((d) => (
          <View key={`${d.conference}-${d.division}`} style={styles.division}>
            <Text style={styles.divisionTitle}>{d.conference} {d.division}</Text>
            {d.teams.map((t) => {
              const flags = t.players.filter((p) => injuredOut.includes(p.id) || questionable.includes(p.id)).length;
              return (
                <TouchableOpacity key={t.id} style={styles.row} activeOpacity={0.75} onPress={() => onOpenTeam(t.id)}>
                  <TeamMark team={t} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{t.city} {t.name}</Text>
                    <Text style={styles.meta}>{t.coaching.offScheme} · {t.coaching.defFront} / {t.coaching.baseCoverage}{t.coaching.headCoach ? ` · ${t.coaching.headCoach}` : ''}</Text>
                  </View>
                  {flags > 0 && <View style={styles.flag}><Text style={styles.flagText}>{flags}</Text></View>}
                  <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  clear: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.negative },
  clearText: { color: colors.negative, fontWeight: '800', fontSize: 12 },
  division: { marginBottom: spacing.lg },
  divisionTitle: { color: colors.inkFaint, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  name: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  meta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  flag: { backgroundColor: colors.negative, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  flagText: { color: colors.white, fontWeight: '900', fontSize: 10 },
});
