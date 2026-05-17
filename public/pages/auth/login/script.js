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
const auth     = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const statusEl  = document.getElementById('status');
const signInBtn = document.getElementById('sign-in-btn');
const guestBtn  = document.getElementById('guest-btn');

// If already signed in, go straight to game
auth.onAuthStateChanged(user => {
    if (user) redirectToGame();
});

async function signInWithGoogle() {
    signInBtn.disabled = true;
    statusEl.textContent = 'Opening Google sign-in\u2026';
    try {
        await auth.signInWithPopup(provider);
        // onAuthStateChanged will fire and redirect
    } catch (err) {
        statusEl.textContent = 'Sign-in failed: ' + err.message;
        signInBtn.disabled = false;
    }
}

function playAsGuest() {
    redirectToGame(true);
}

function redirectToGame(guest = false) {
    statusEl.textContent = guest ? 'Entering as guest\u2026' : 'Signed in! Loading world\u2026';
    window.location.href = '/';
}
