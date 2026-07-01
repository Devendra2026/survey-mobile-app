function fieldError<T extends object>(fields: T | undefined, name: keyof T & string): string | undefined {
  if (!fields || !(name in fields)) return undefined;

  const field = fields[name as keyof T];
  if (!field) return undefined;
  if (Array.isArray(field)) return (field[0] as { message?: string } | undefined)?.message;
  return (field as { message?: string }).message;
}

type ClerkApiError = { errors?: { longMessage?: string; message?: string }[] };

const CLERK_DEV_EMAIL_LIMIT = /monthly limit for email messages in development/i;
const CLERK_REDIRECT_URI_MISMATCH = /does not match an authorized redirect uri/i;

function clerkRedirectAllowlistMessage(raw: string): string {
  const urlMatch = raw.match(/([a-z][a-z0-9+.-]*:\/\/[^\s]+)/i);
  const redirectUrl = urlMatch?.[1] ?? 'surveyapp://sso-callback';
  return (
    `Google sign-in is not configured in Clerk yet. An admin must allowlist this redirect URL ` +
    `in Clerk Dashboard → Configure → Native applications → Allowlist for mobile SSO redirect:\n\n` +
    `${redirectUrl}\n\n` +
    `Or run: CLERK_SECRET_KEY=sk_live_… npm run clerk:allowlist-oauth-redirect:prod`
  );
}

/** Message from a Clerk API error (Core 3 `{ error }` returns or thrown legacy errors). */
export function clerkErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const first = (err as ClerkApiError).errors?.[0];
    const raw = first?.longMessage ?? first?.message;
    if (raw) {
      if (CLERK_DEV_EMAIL_LIMIT.test(raw)) {
        return 'Clerk development instance email limit reached (100/month). Ask your admin to retry later or upgrade Clerk.';
      }
      if (CLERK_REDIRECT_URI_MISMATCH.test(raw)) {
        return clerkRedirectAllowlistMessage(raw);
      }
      return raw;
    }
  }
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const raw = (err as { message: string }).message;
    if (CLERK_REDIRECT_URI_MISMATCH.test(raw)) {
      return clerkRedirectAllowlistMessage(raw);
    }
    return raw;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
