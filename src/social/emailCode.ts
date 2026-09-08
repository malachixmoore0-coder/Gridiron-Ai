/**
 * Whether the sign-in mail actually carries a six-digit code.
 *
 * The code is the reliable way in — a link is single-use and mail scanners
 * follow links in the background to check them, which spends the link before a
 * human ever taps it, whereas nothing can read and type a code on the user's
 * behalf. But the code only exists if the email template contains `{{ .Token }}`,
 * and Supabase will not let a project edit its templates at all until custom
 * SMTP is configured. So on a fresh project there is no code in the mail, and
 * offering a box to type one into is a promise the email cannot keep.
 *
 * Hence a flag, off by default, flipped only once the template has been edited:
 *
 *   EXPO_PUBLIC_EMAIL_CODE=1
 *
 * Same reasoning as the OAuth provider list next door — the client cannot ask
 * Supabase what its templates say, so it is told, and the honest default is to
 * assume the feature is not there.
 */
const RAW = ((process.env.EXPO_PUBLIC_EMAIL_CODE as string | undefined) ?? '').trim().toLowerCase();

export const emailCodeEnabled = RAW === '1' || RAW === 'true' || RAW === 'yes';
