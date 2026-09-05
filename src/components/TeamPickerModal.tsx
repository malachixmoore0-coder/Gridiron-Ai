import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Team } from '@/engine/types';
import { DIVISIONS } from '@/data/teams';
import { colors, radius, spacing } from '@/theme';
import { TeamMark } from './TeamMark';

interface Props {
  visible: boolean;
  title: string;
  selectedId?: string;
  excludeId?: string;
  onSelect: (team: Team) => void;
  onClose: () => void;
}

export function TeamPickerModal({ visible, title, selectedId, excludeId, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {DIVISIONS.map((d) => (
            <View key={`${d.conference}-${d.division}`} style={styles.division}>
              <Text style={styles.divisionTitle}>{d.conference} {d.division}</Text>
              <View style={styles.grid}>
                {d.teams.map((t) => {
                  const disabled = t.id === excludeId;
                  const selected = t.id === selectedId;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.cell, selected && styles.cellSelected, disabled && styles.cellDisabled]}
                      disabled={disabled}
                      activeOpacity={0.7}
                      onPress={() => { onSelect(t); onClose(); }}
                    >
                      <TeamMark team={t} size={40} />
                      <Text style={styles.cellText} numberOfLines={1}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  division: { marginBottom: spacing.lg },
  divisionTitle: { color: colors.inkFaint, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cellSelected: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  cellDisabled: { opacity: 0.3 },
  cellText: { color: colors.inkDim, fontSize: 11, fontWeight: '700' },
});
