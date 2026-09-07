/**
 * GIF search.
 *
 * GIPHY needs a key, and shipping without one would mean a dead button. So:
 * with a key the picker searches; without one it says so and still accepts a
 * pasted GIF URL, which keeps the feature usable and honest.
 *
 *   EXPO_PUBLIC_GIPHY_KEY=<key from developers.giphy.com>
 */
const KEY = (process.env.EXPO_PUBLIC_GIPHY_KEY as string | undefined)?.trim();

export const giphyReady = !!KEY;

export interface Gif { id: string; url: string; preview: string; title: string }

export async function searchGifs(q: string, limit = 18): Promise<Gif[]> {
  if (!KEY) return [];
  const endpoint = q.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${KEY}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`GIPHY ${res.status}`);
  const json = (await res.json()) as { data: { id: string; title: string; images: Record<string, { url: string }> }[] };
  return (json.data ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    url: g.images.downsized?.url ?? g.images.original?.url ?? '',
    preview: g.images.fixed_width_small?.url ?? g.images.preview_gif?.url ?? g.images.downsized?.url ?? '',
  })).filter((g) => g.url);
}

/** Accept a pasted link only if it actually points at an image. */
export const looksLikeGif = (url: string) => /^https:\/\/\S+\.(gif|webp|mp4)(\?\S*)?$/i.test(url.trim());
