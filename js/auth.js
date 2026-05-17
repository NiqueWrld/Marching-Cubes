// ─── Firebase Auth (Google Sign-In) ──────────────────────────────────────────
// Uses Firebase compat SDK loaded via CDN in index.html

const firebaseConfig = {
    apiKey:            "AIzaSyDa28qQZ2bAdGN8lq9AtA8BQB3q9gwN8z0",
    authDomain:        "shaka-zulu-581b6.firebaseapp.com",
    databaseURL:       "https://shaka-zulu-581b6-default-rtdb.firebaseio.com",
    projectId:         "shaka-zulu-581b6",
    storageBucket:     "shaka-zulu-581b6.appspot.com",
    messagingSenderId: "316811432200",
    appId:             "1:316811432200:web:47f115f6b6e163ba8f9cbd"
};

firebase.initializeApp(firebaseConfig);

const Auth = (() => {
    const auth     = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    let _user      = null;
    let _token     = null;
    let _onReady   = null;      // resolved once auth state is known

    const ready = new Promise(resolve => { _onReady = resolve; });

    auth.onAuthStateChanged(async (user) => {
        _user  = user;
        _token = user ? await user.getIdToken() : null;
        _onReady();

        // Refresh token before it expires (~55 min)
        if (user) {
            setInterval(async () => {
                _token = await user.getIdToken(true);
            }, 55 * 60 * 1000);
        }

        updateAuthUI();
    });

    function updateAuthUI() {
        const signInBtn  = document.getElementById('sign-in-btn');
        const signOutBtn = document.getElementById('sign-out-btn');
        const userInfo   = document.getElementById('user-info');
        const userName   = document.getElementById('user-name');
        const userPhoto  = document.getElementById('user-photo');

        if (_user) {
            signInBtn .style.display = 'none';
            signOutBtn.style.display = '';
            userInfo  .style.display = '';
            userName.textContent = _user.displayName ?? _user.email ?? 'Player';
            if (_user.photoURL) userPhoto.src = _user.photoURL;
        } else {
            signInBtn .style.display = '';
            signOutBtn.style.display = 'none';
            userInfo  .style.display = 'none';
        }
    }

    async function signIn() {
        try {
            await auth.signInWithPopup(provider);
        } catch (err) {
            console.error('Sign-in error:', err.message);
        }
    }

    async function signOut() {
        await auth.signOut();
    }

    // Fetch saved position from server; falls back to null
    async function loadServerPosition() {
        if (!_token) return null;
        try {
            const res = await fetch('/api/player', {
                headers: { Authorization: `Bearer ${_token}` }
            });
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    // Persist position to server (fire-and-forget)
    function saveServerPosition(x, y, z, yaw, pitch) {
        if (!_token) return;
        fetch('/api/player', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
            body:    JSON.stringify({ x, y, z, yaw, pitch })
        }).catch(() => {});
    }

    return { ready, signIn, signOut, getToken: () => _token, getUser: () => _user, loadServerPosition, saveServerPosition };
})();

// Button wiring
document.getElementById('sign-in-btn') .addEventListener('click', () => Auth.signIn());
document.getElementById('sign-out-btn').addEventListener('click', () => Auth.signOut());
