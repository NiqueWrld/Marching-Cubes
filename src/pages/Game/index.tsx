import { useEffect, useRef, useState } from 'react';
import isMobile from '../../lib/isMobile';
import MobileControls from './Controls/Mobile';

export default function Game() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [tapToStart, setTapToStart] = useState(isMobile);

    async function handleTap() {
        try {
            await document.documentElement.requestFullscreen();
        } catch { /* ignored */ }
        try {
            const orientation = screen.orientation as ScreenOrientation & {
                lock?: (o: string) => Promise<void>;
            };
            await orientation.lock?.('landscape');
        } catch { /* ignored */ }
        setTapToStart(false);
    }

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        let cleanup: (() => void) | undefined;
        import('../../main.js').then(({ startGame }) => {
            cleanup = startGame(container);
        });

        return () => cleanup?.();
    }, []);

    return (
        <div className="fixed inset-0 bg-black overflow-hidden">
            {/* Three.js canvas goes here */}
            <div ref={containerRef} className="absolute inset-0" />
            {isMobile && !tapToStart && <MobileControls />}

            {/* Tap to start overlay – mobile only */}
            {tapToStart && (
                <div
                    onClick={handleTap}
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-white cursor-pointer"
                >
                    <p className="text-2xl font-bold tracking-widest mb-2">TAP TO START</p>
                    <p className="text-xs text-white/50">Enters fullscreen &amp; landscape</p>
                </div>
            )}

            {/* HUD */}
            <div id="ui" className="fixed top-4 left-4 pointer-events-none select-none text-cyan-400 font-mono">
                <h1 className="text-lg mb-2 tracking-widest" style={{ textShadow: '0 0 8px #0ff' }}>
                    MARCHING CUBES
                </h1>
                <p id="pos" className="text-xs leading-relaxed opacity-80" style={{ textShadow: '0 0 8px #0ff' }}>
                    Position: 0, 0, 0
                </p>
                {isMobile ? (
                    <p className="text-xs leading-relaxed opacity-80" style={{ textShadow: '0 0 8px #0ff' }}>
                        Left stick – Move &nbsp; Right side – Look &nbsp; Jump – Button
                    </p>
                ) : (
                    <>
                        <p className="text-xs leading-relaxed opacity-80" style={{ textShadow: '0 0 8px #0ff' }}>
                            WASD – Move &nbsp; Space – Jump &nbsp; Shift – Sprint
                        </p>
                        <p className="text-xs leading-relaxed opacity-80" style={{ textShadow: '0 0 8px #0ff' }}>
                            Mouse – Look &nbsp; Click – Lock cursor
                        </p>
                    </>
                )}

                {/* Auth panel */}
                <div id="auth-panel" className="mt-3 flex items-center gap-2 pointer-events-auto">
                    <button
                        id="sign-in-btn"
                        className="flex items-center gap-2 text-white text-xs px-3 py-1.5 rounded shadow font-semibold bg-[#4285F4] hover:bg-[#357ae8] transition-colors"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 48 48">
                            <path fill="#fff" d="M44.5 20H24v8.5h11.7C34.1 33.9 29.6 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.8 20-21 0-1.4-.1-2.7-.5-4z" />
                        </svg>
                        Sign in with Google
                    </button>
                    <div id="user-info" className="hidden flex items-center gap-2">
                        <img id="user-photo" src="" alt="avatar" className="w-7 h-7 rounded-full object-cover" />
                        <span id="user-name" className="text-xs text-cyan-300" />
                        <button id="sign-out-btn" className="text-xs text-white/50 hover:text-white underline pointer-events-auto">
                            Sign out
                        </button>
                    </div>
                </div>
            </div>

            {/* Crosshair */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none">
                <div className="absolute left-[9px] top-0 w-[2px] h-full bg-white/70" />
                <div className="absolute top-[9px] left-0 h-[2px] w-full bg-white/70" />
            </div>

            {/* Info bar – desktop only */}
            {!isMobile && (
                <div id="info" className="fixed bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs font-mono pointer-events-none">
                    Click to capture mouse
                </div>
            )}

            {/* Loading / locked message */}
            <div
                id="locked-msg"
                className="hidden fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xl text-center bg-black/70 px-10 py-6 rounded-lg border border-white/20 font-mono"
            >
                Loading world…
            </div>
        </div>
    );
}
