import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import type { UserCredential } from 'firebase/auth';
import { auth } from './firebase.js';

/** True when running inside the Capacitor Android/iOS app. */
export function isNativeApp(): boolean {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
}

let _initialized = false;

/** Google sign-in via the native account picker, then exchanges the token with Firebase. */
export async function signInWithGoogleNative(): Promise<UserCredential> {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');

    if (!_initialized) {
        await SocialLogin.initialize({
            google: {
                webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
            },
        });
        _initialized = true;
    }

    const res = await SocialLogin.login({ provider: 'google', options: {} });
    const idToken = (res.result as { idToken?: string | null }).idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token');

    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}
