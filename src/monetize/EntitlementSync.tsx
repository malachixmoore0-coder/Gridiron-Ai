/**
 * The wire between "who is signed in" and "what have they paid for".
 *
 * These are two different providers, and entitlements sits above the social
 * layer in the tree, so it cannot reach in for the session token itself. Rather
 * than reorder the providers — which would put payment state underneath the
 * feed for no better reason than plumbing — this component lives inside the
 * social provider and hands the token down to the check.
 *
 * It runs whenever the session changes, and again on a slow beat, because a
 * subscription can lapse, be refunded, or be charged back while the app is
 * open. Nothing here renders.
 */
import { useEffect } from 'react';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useSocial } from '@/social/SocialContext';

/** How often a signed-in session re-confirms its tier. */
const RECHECK_MS = 900_000;

export function EntitlementSync() {
  const ent = useEntitlements();
  const social = useSocial();
  const token = social.session?.token ?? null;

  useEffect(() => {
    if (!ent.verifiable) return;
    let live = true;
    const run = () => { if (live) ent.sync(token).catch(() => {}); };
    run();
    const t = setInterval(run, RECHECK_MS);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ent.verifiable]);

  return null;
}
