import { useState } from 'react';
import { GoogleLogo, User } from '@phosphor-icons/react';
import { signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, provider } from '../../lib/firebase.js';

export default function Login() {
    const [status, setStatus] = useState('');
    const navigate = useNavigate();

    async function signInWithGoogle() {
        setStatus('Opening Google sign-in…');
        try {
            await signInWithPopup(auth, provider);
            navigate('/game');
        } catch (err) {
            setStatus(`Error: ${(err as Error).message}`);
        }
    }

    function playAsGuest() {
        navigate('/game');
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="card p-8 flex flex-col gap-4 w-full max-w-sm">
                <h1 className="text-2xl font-bold text-center">Marching Cubes</h1>
                {status && <p className="text-sm text-center text-gray-500">{status}</p>}
                <button
                    id="sign-in-btn"
                    onClick={signInWithGoogle}
                    className="flex items-center justify-center gap-2 btn btn-primary"
                >
                    <GoogleLogo size={18} />
                    Sign in with Google
                </button>
                <button
                    id="guest-btn"
                    onClick={playAsGuest}
                    className="flex items-center justify-center gap-2 btn btn-secondary"
                >
                    <User size={18} />
                    Play as Guest
                </button>
            </div>
        </div>
    );
}

