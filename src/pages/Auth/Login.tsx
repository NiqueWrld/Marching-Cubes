import { useState } from 'react';
import { GoogleLogo } from '@phosphor-icons/react';
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

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col gap-4 w-full max-w-sm shadow-lg">
                <h1 className="text-2xl font-bold text-center text-white">Marching Cubes</h1>
                {status && <p className="text-sm text-center text-gray-400">{status}</p>}
                <button
                    id="sign-in-btn"
                    onClick={signInWithGoogle}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                    <GoogleLogo size={18} />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}

