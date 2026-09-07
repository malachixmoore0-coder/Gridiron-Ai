/**
 * Team news.
 *
 * The refresh workflow pulls ESPN's team headlines into the published feed, so
 * the app reads one small JSON per team rather than hitting a news API from
 * every device. It is cached on the device between opens and refetched when the
 * copy on hand is older than a few minutes.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATA_URL } from '@/cfb/context/TeamsContext';

export interface NewsItem {
  id: string;
  headline: string;
  description: string;
  published: string;
  byline: string | null;
  link: string | null;
  image: string | null;
  source: string;
}

export interface TeamNewsFile { teamId: string; generatedAt: string; items: NewsItem[] }

const MEM = new Map<string, { at: number; items: NewsItem[] }>();
const FRESH_MS = 5 * 60_000;
const PREFIX = 'cfb-gridiron-ai.news.v1.';

export function useTeamNews(teamId: string | null | undefined, baseUrl: string = DATA_URL) {
  const [items, setItems] = useState<NewsItem[]>(() => (teamId && MEM.get(`${baseUrl}${teamId}`)?.items) || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!teamId) { setItems([]); return; }
    const key = `${baseUrl}${teamId}`;
    const hit = MEM.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) { setItems(hit.items); return; }

    let live = true;
    setLoading(true);
    (async () => {
      if (!hit) {
        try {
          const raw = await AsyncStorage.getItem(PREFIX + key);
          if (raw && live) setItems((JSON.parse(raw) as TeamNewsFile).items ?? []);
        } catch { /* no cache */ }
      }
      try {
        const res = await fetch(`${baseUrl}/news/${teamId}.json?t=${Math.floor(Date.now() / 300_000)}`);
        if (!res.ok) throw new Error(String(res.status));
        const file = (await res.json()) as TeamNewsFile;
        if (!live) return;
        const list = Array.isArray(file.items) ? file.items : [];
        MEM.set(key, { at: Date.now(), items: list });
        setItems(list);
        AsyncStorage.setItem(PREFIX + key, JSON.stringify(file)).catch(() => {});
      } catch {
        // No news file yet for this team — the section simply does not render.
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [teamId, baseUrl]);

  return { items, loading };
}
