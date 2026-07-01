import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

/** Must match `scheme` in app.json. */
export const APP_SCHEME = 'surveyapp';

/** Clerk mobile SSO redirect — must be allowlisted in Clerk Dashboard (Native applications). */
export const CLERK_OAUTH_REDIRECT_URL = `${APP_SCHEME}://sso-callback`;

export function getClerkOAuthRedirectUrl(): string {
  return AuthSession.makeRedirectUri({
    scheme: APP_SCHEME,
    path: 'sso-callback',
  });
}

/** Expo Go cannot register custom URL schemes — browser OAuth requires a dev/preview build. */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}
