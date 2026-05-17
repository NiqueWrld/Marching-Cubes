import { signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, provider } from './lib/firebase.js';

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
                _token = await user.getIdToken(true);
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
            if (signInBtn)  signInBtn.style.display  = 'none';
            if (signOutBtn) signOutBtn.style.display = '';
            if (userInfo)   userInfo.style.display   = '';
            if (userName)   userName.textContent = _user.displayName ?? _user.email ?? 'Player';
            if (userPhoto && _user.photoURL) userPhoto.src = _user.photoURL;
        } else {
            if (signInBtn)  signInBtn.style.display  = '';
            if (signOutBtn) signOutBtn.style.display = 'none';
            if (userInfo)   userInfo.style.display   = 'none';
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
        await fbSignOut(auth);
    }

    async function loadServerPosition(): Promise<PlayerPosition | null> {
        if (!_token) return null;
        try {
            const res = await fetch('/api/player', {
                headers: { Authorization: `Bearer ${_token}` },
            });
            if (!res.ok) return null;
            return await res.json() as PlayerPosition;
        } catch {
            return null;
        }
    }

    function saveServerPosition(x: number, y: number, z: number, yaw: number, pitch: number): void {
        if (!_token) return;
        fetch('/api/player', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
            body:    JSON.stringify({ x, y, z, yaw, pitch }),
        }).catch(() => {});
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
