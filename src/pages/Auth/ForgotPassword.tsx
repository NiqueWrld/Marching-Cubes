import { useState } from 'react';
import type { FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { auth } from '../../lib/firebase.js';
import ROUTES from '../../lib/routes.js';

export default function ForgotPassword() {
    const [email, setEmail]   = useState('');
    const [busy, setBusy]     = useState(false);
    const [status, setStatus] = useState('');
    const [sent, setSent]     = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setStatus('Sending reset email…');
        try {
            await sendPasswordResetEmail(auth, email);
            setSent(true);
            setStatus(`Password reset email sent to ${email}. Check your inbox.`);
        } catch (err) {
            setStatus(`Error: ${(err as Error).message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col gap-4 w-full max-w-sm shadow-lg">
                <h1 className="text-2xl font-bold text-center text-white">Reset password</h1>
                <p className="text-sm text-center text-gray-400">
                    Enter your email and we&apos;ll send you a reset link.
                </p>
                {status && (
                    <p className={`text-sm text-center ${sent ? 'text-green-400' : 'text-gray-400'}`}>
                        {status}
                    </p>
                )}
                {!sent && (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email"
                            required
                            autoComplete="email"
                            className="px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                        />
                        <button
                            type="submit"
                            disabled={busy}
                            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors"
                        >
                            Send reset link
                        </button>
                    </form>
                )}
                <Link to={ROUTES.LOGIN} className="text-sm text-center text-gray-400 hover:text-white">
                    Back to login
                </Link>
            </div>
        </div>
    );
}
