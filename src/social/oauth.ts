/**
 * Which social sign-ins are actually switched on.
 *
 * The Google and Apple buttons shipped whether or not either provider was
 * configured, and a disabled one fails in the quietest possible way: Supabase
 * returns an error, the context stores it, and no screen renders it — so the
 * button does nothing at all and the person taps it again. A dead button is
 * worse than a missing one, because a missing one is not a promise.
 *
 * The client cannot ask Supabase which providers an project has enabled, so it
 * is told. Unset means none, which is the honest default: enabling a provider
 * is a dashboard change and adding it here is the same change, made twice on
 * purpose so the button and the backend cannot disagree.
 *
 *   EXPO_PUBLIC_OAUTH_PROVIDERS=google,apple
 */
export type OAuthProvider = 'google' | 'apple';

const ALLOWED: OAuthProvider[] = ['google', 'apple'];

export const OAUTH_PROVIDERS: OAuthProvider[] = ((process.env.EXPO_PUBLIC_OAUTH_PROVIDERS as string | undefined) ?? '')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter((p): p is OAuthProvider => (ALLOWED as string[]).includes(p));

export const oauthEnabled = (p: OAuthProvider) => OAUTH_PROVIDERS.includes(p);
