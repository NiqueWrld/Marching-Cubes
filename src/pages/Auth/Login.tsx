import { useState } from 'react';
import type { FormEvent } from 'react';
import { GoogleLogo } from '@phosphor-icons/react';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { auth, provider } from '../../lib/firebase.js';
import { isNativeApp, signInWithGoogleNative } from '../../lib/nativeGoogleAuth.js';
import ROUTES from '../../lib/routes.js';

export default function Login() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy]         = useState(false);
    const [status, setStatus] = useState('');
    const navigate = useNavigate();

    async function signInWithGoogle() {
        setStatus('Opening Google sign-in…');
        try {
            if (isNativeApp()) {
                await signInWithGoogleNative();
            } else {
                await signInWithPopup(auth, provider);
            }
            navigate('/game');
        } catch (err) {
            setStatus(`Error: ${(err as Error).message}`);
        }
    }

    async function signInWithEmail(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setStatus('Signing in…');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/game');
        } catch (err) {
            setStatus(`Error: ${(err as Error).message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col gap-4 w-full max-w-sm shadow-lg">
                <h1 className="text-2xl font-bold text-center text-white">QuickLife</h1>
                {status && <p className="text-sm text-center text-gray-400">{status}</p>}
                <form onSubmit={signInWithEmail} className="flex flex-col gap-3">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        autoComplete="email"
                        className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        autoComplete="current-password"
                        className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                    />
                    <button
                        type="submit"
                        disabled={busy}
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors"
                    >
                        Sign in
                    </button>
                </form>
                <div className="flex justify-between text-sm">
                    <Link to={ROUTES.FORGOT_PASSWORD} className="text-gray-400 hover:text-white">Forgot password?</Link>
                    <Link to={ROUTES.REGISTER} className="text-gray-400 hover:text-white">Create account</Link>
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-800" />
                    <span className="text-xs text-gray-500">or</span>
                    <div className="h-px flex-1 bg-gray-800" />
                </div>
                <button
                    id="sign-in-btn"
                    onClick={signInWithGoogle}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium transition-colors"
                >
                    <GoogleLogo size={18} />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}

