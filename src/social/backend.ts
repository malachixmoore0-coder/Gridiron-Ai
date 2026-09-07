/** Pick the backend once, at startup: shared when it is configured, device-only otherwise. */
import type { Backend } from './types';
import { LocalBackend } from './local';
import { SupabaseBackend, supabaseConfigured } from './supabase';

let instance: Backend | null = null;

export function backend(): Backend {
  if (!instance) instance = supabaseConfigured ? new SupabaseBackend() : new LocalBackend();
  return instance;
}

export const socialIsLive = () => backend().live;
