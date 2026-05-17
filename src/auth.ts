import { signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { auth, provider, database } from './lib/firebase.js';

export { auth, onAuthStateChanged };

export interface PlayerPosition {
    x: number; y: number; z: number;
    yaw: number; pitch: number;
}

export const Auth = (() => {
    let _user:    User | null   = null;
    let _token:   string | null = null;
    let _onReady!: () => void;

    const ready = new Promise<void>(resolve => { _onReady = resolve; });

    onAuthStateChanged(auth, async (user) => {
        _user  = user;
        _token = user ? await user.getIdToken() : null;
        _onReady();

        if (user) {
            setInterval(async () => {
                try {
                    _token = await user.getIdToken(true);
                } catch (err) {
                    console.error('[Auth] Token refresh failed:', err);
                }
            }, 55 * 60 * 1000);
        }
        _updateAuthUI();
    });

    function _updateAuthUI(): void {
        const signInBtn  = document.getElementById('sign-in-btn')  as HTMLButtonElement | null;
        const signOutBtn = document.getElementById('sign-out-btn') as HTMLButtonElement | null;
        const userInfo   = document.getElementById('user-info')    as HTMLElement | null;
        const userName   = document.getElementById('user-name')    as HTMLElement | null;
        const userPhoto  = document.getElementById('user-photo')   as HTMLImageElement | null;

        if (_user) {
            signInBtn?.classList.add('hidden');
            userInfo?.classList.remove('hidden');
            if (userName)   userName.textContent = _user.displayName ?? _user.email ?? 'Player';
            if (userPhoto && _user.photoURL) userPhoto.src = _user.photoURL;
        } else {
            signInBtn?.classList.remove('hidden');
            userInfo?.classList.add('hidden');
        }
    }

    async function signIn(): Promise<void> {
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            console.error('Sign-in error:', (err as Error).message);
        }
    }

    async function signOut(): Promise<void> {
        try {
            await fbSignOut(auth);
        } catch (err) {
            console.error('[Auth] Sign-out failed:', err);
        }
    }

    async function loadServerPosition(): Promise<PlayerPosition | null> {
        if (!_user) return null;
        try {
            const snap = await get(ref(database, `players/${_user.uid}/position`));
            return snap.exists() ? (snap.val() as PlayerPosition) : null;
        } catch (err) {
            console.warn('[Auth] loadServerPosition RTDB error:', err);
            return null;
        }
    }

    function saveServerPosition(x: number, y: number, z: number, yaw: number, pitch: number): Promise<void> {
        if (!_user) return Promise.resolve();
        return set(ref(database, `players/${_user.uid}/position`), { x, y, z, yaw, pitch })
            .catch(err => { console.warn('[Auth] saveServerPosition RTDB error:', err); });
    }

    return {
        ready,
        signIn,
        signOut,
        getToken: (): string | null => _token,
        getUser:  (): User | null   => _user,
        loadServerPosition,
        saveServerPosition,
    };
})();
