import type { Weather } from '../engine/types';

/**
 * A curated sample slate of marquee / rivalry matchups so the Slate tab has
 * something to chew on out of the box. It is NOT a real week's schedule — swap
 * in the actual games (or wire a schedule feed) when you have one.
 */
export interface SlateGame {
  id: string;
  awayId: string;
  homeId: string;
  label: string;
  weather?: Weather;
  primetime?: boolean;
  neutralSite?: boolean;
}

export const SAMPLE_SLATE: SlateGame[] = [
  { id: 'dal-phi', awayId: 'dal', homeId: 'phi', label: 'NFC East grudge match', primetime: true },
  { id: 'kc-buf', awayId: 'kc', homeId: 'buf', label: 'AFC title-game rematch', weather: 'wind' },
  { id: 'gb-det', awayId: 'gb', homeId: 'det', label: 'NFC North on the line' },
  { id: 'sf-sea', awayId: 'sf', homeId: 'sea', label: 'Loudest building in the league', primetime: true },
  { id: 'bal-cin', awayId: 'bal', homeId: 'cin', label: 'Jackson vs Burrow' },
  { id: 'lar-lac', awayId: 'lar', homeId: 'lac', label: 'Battle for L.A.' },
  { id: 'hou-ind', awayId: 'hou', homeId: 'ind', label: 'AFC South decider' },
  { id: 'was-nyg', awayId: 'was', homeId: 'nyg', label: 'Division dogfight', weather: 'rain' },
  { id: 'min-chi', awayId: 'min', homeId: 'chi', label: 'Cold-weather trench war', weather: 'cold' },
  { id: 'den-pit', awayId: 'den', homeId: 'pit', label: 'Two elite pass rushes' },
  { id: 'tb-atl', awayId: 'tb', homeId: 'atl', label: 'NFC South shootout' },
  { id: 'ne-nyj', awayId: 'ne', homeId: 'nyj', label: 'Vrabel vs Glenn' },
];
