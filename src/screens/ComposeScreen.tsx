/**
 * The composer.
 *
 * Text, hashtags, a GIF and — the part that matters — a pick off your own card
 * with the model's numbers still attached. Sharing a pick without its
 * probability is just a screenshot; this keeps the receipt on it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type as T, clearance } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLeague } from '@/league/LeagueContext';
import { hashtagsIn, type PostPick } from '@/social/types';
import { giphyReady, looksLikeGif, searchGifs, type Gif } from '@/social/giphy';
import { Avatar, SignInRow } from '@/components/Social';
import { LEAGUE_BY_KEY } from '@/sports/types';

interface Props { onDone: () => void; initialPick?: PostPick | null; }

const MAX = 500;

export function ComposeScreen({ onDone, initialPick }: Props) {
  const s = useSocial();
  const eng = useEngagement();
  const { league, viewFor } = useLeague();
  const [text, setText] = useState(initialPick ? `${initialPick.label} — ` : '');
  const [pick, setPick] = useState<PostPick | null>(initialPick ?? null);
  const [gif, setGif] = useState<string | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [gifBusy, setGifBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tags = useMemo(() => hashtagsIn(text), [text]);
  const left = MAX - text.length;

  useEffect(() => {
    if (!gifOpen || !giphyReady) return;
    let live = true;
    setGifBusy(true);
    searchGifs(gifQuery)
      .then((r) => { if (live) setGifs(r); })
      .catch(() => { if (live) setGifs([]); })
      .finally(() => { if (live) setGifBusy(false); });
    return () => { live = false; };
  }, [gifOpen, gifQuery]);

  /** Open picks on the card, newest first — the things worth posting about. */
  const candidates = useMemo(() => eng.picks.filter((p) => p.status === 'open').slice(0, 20), [eng.picks]);

  const send = async () => {
    if (!text.trim() && !pick && !gif) return;
    await s.post({ text, gifUrl: gif, pick });
    onDone();
  };

  if (!s.signedIn) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Text style={styles.title}>Post a pick</Text>
        <View style={styles.signCard}>
          <Text style={styles.signBlurb}>Sign in first — a post needs a profile to belong to.</Text>
          <SignInRow onGoogle={() => s.signIn('google')} onApple={() => s.signIn('apple')} busy={s.busy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title}>New post</Text>
        <TouchableOpacity
          style={[styles.send, (!text.trim() && !pick && !gif) && styles.sendOff]}
          activeOpacity={0.85}
          onPress={send}
          disabled={s.busy || (!text.trim() && !pick && !gif)}
          accessibilityLabel="Post"
        >
          <Text style={styles.sendText}>{s.busy ? 'Posting…' : 'Post'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.editor}>
          <Avatar profile={s.me} size={38} />
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX))}
            placeholder="What are you taking, and why? Use #hashtags."
            placeholderTextColor={colors.inkGhost}
            multiline
            autoFocus
          />
        </View>

        {!!tags.length && (
          <View style={styles.tags}>
            {tags.map((t) => <View key={t} style={styles.tagChip}><Text style={styles.tagText}>#{t}</Text></View>)}
          </View>
        )}

        {!!pick && (
          <View style={styles.pick}>
            <View style={styles.pickTag}><Text style={styles.pickTagText}>{LEAGUE_BY_KEY[pick.league]?.short ?? 'NFL'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pickLabel}>{pick.label}</Text>
              <Text style={styles.pickMeta}>model {pick.modelPct.toFixed(0)}% · edge +{pick.edge.toFixed(1)}</Text>
            </View>
            <TouchableOpacity onPress={() => setPick(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Remove pick">
              <Ionicons name="close" size={16} color={colors.inkFaint} />
            </TouchableOpacity>
          </View>
        )}

        {!!gif && (
          <View style={styles.gifWrap}>
            <Image source={{ uri: gif }} style={styles.gif} resizeMode="cover" />
            <TouchableOpacity style={styles.gifClose} onPress={() => setGif(null)} accessibilityLabel="Remove GIF">
              <Ionicons name="close" size={14} color={colors.ink} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tools}>
          <TouchableOpacity style={styles.tool} activeOpacity={0.85} onPress={() => setPickerOpen((v) => !v)}>
            <Ionicons name="bookmark-outline" size={15} color={colors.green} />
            <Text style={styles.toolText}>Attach a pick</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tool} activeOpacity={0.85} onPress={() => setGifOpen((v) => !v)}>
            <Ionicons name="images-outline" size={15} color={colors.green} />
            <Text style={styles.toolText}>GIF</Text>
          </TouchableOpacity>
          <Text style={[styles.count, left < 40 && { color: left < 0 ? colors.negative : colors.gold }]}>{left}</Text>
        </View>

        {pickerOpen && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Open picks on your card</Text>
            {candidates.length === 0 && <Text style={styles.panelEmpty}>Nothing open right now. Save a pick from the Edge Board first.</Text>}
            {candidates.map((p) => {
              const view = viewFor(league);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.candidate}
                  activeOpacity={0.85}
                  onPress={() => {
                    setPick({
                      league, gameId: p.gameId, awayId: p.awayId, homeId: p.homeId,
                      market: p.market, side: p.side, number: p.number,
                      label: p.label, modelPct: p.modelPct, edge: p.edge,
                    });
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.candidateLabel}>{p.label}</Text>
                  <Text style={styles.candidateMeta}>{view.abbrOf(p.awayId)} @ {view.abbrOf(p.homeId)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {gifOpen && (
          <View style={styles.panel}>
            {giphyReady ? (
              <>
                <TextInput
                  style={styles.gifSearch}
                  value={gifQuery}
                  onChangeText={setGifQuery}
                  placeholder="Search GIFs"
                  placeholderTextColor={colors.inkGhost}
                />
                {gifBusy && <ActivityIndicator color={colors.green} style={{ marginVertical: spacing.md }} />}
                <View style={styles.gifGrid}>
                  {gifs.map((g) => (
                    <TouchableOpacity key={g.id} activeOpacity={0.85} onPress={() => { setGif(g.url); setGifOpen(false); }}>
                      <Image source={{ uri: g.preview }} style={styles.gifThumb} accessibilityLabel={g.title} />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.panelEmpty}>GIFs by GIPHY.</Text>
              </>
            ) : (
              <>
                <Text style={styles.panelTitle}>GIF search needs a key</Text>
                <Text style={styles.panelEmpty}>
                  Set EXPO_PUBLIC_GIPHY_KEY to search from here. Until then you can paste a direct GIF link.
                </Text>
                <TextInput
                  style={styles.gifSearch}
                  onChangeText={(v) => { if (looksLikeGif(v)) { setGif(v.trim()); setGifOpen(false); } }}
                  placeholder="https://…/something.gif"
                  placeholderTextColor={colors.inkGhost}
                  autoCapitalize="none"
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  title: { ...T.title, color: colors.ink, fontSize: 22, paddingHorizontal: spacing.lg },
  send: { paddingHorizontal: spacing.lg, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.green },
  sendOff: { opacity: 0.4 },
  sendText: { color: colors.bg, fontSize: 13, fontWeight: '900' },

  body: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: clearance.overlay },
  editor: { flexDirection: 'row', gap: spacing.md },
  input: { flex: 1, color: colors.ink, fontSize: 16, lineHeight: 22, minHeight: 110, textAlignVertical: 'top', padding: 0 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  tagChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.greenSoft },
  tagText: { color: colors.green, fontSize: 11, fontWeight: '800' },

  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  pickTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.greenSoft },
  pickTagText: { color: colors.green, fontSize: 9, fontWeight: '900' },
  pickLabel: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  pickMeta: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  gifWrap: { marginTop: spacing.md },
  gif: { width: '100%', height: 190, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  gifClose: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },

  tools: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  toolText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  count: { marginLeft: 'auto', color: colors.inkGhost, fontSize: 12, fontWeight: '800' },

  panel: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  panelTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  panelEmpty: { color: colors.inkFaint, fontSize: 12, lineHeight: 17 },
  candidate: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  candidateLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  candidateMeta: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  gifSearch: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 9, color: colors.ink, fontSize: 13 },
  gifGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gifThumb: { width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.cardAlt },

  signCard: { margin: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderHi, gap: spacing.md },
  signBlurb: { color: colors.inkDim, fontSize: 13, lineHeight: 19 },
});
