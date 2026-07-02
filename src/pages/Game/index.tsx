import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { device } from '../../lib/isMobile';
import { useDevice } from '../../hooks/useDevice';
import ROUTES from '../../lib/routes';
import MobileControls from './Controls/Mobile';

function OnlineBar() {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        // poll the socket player list via a simple global exposed by multiplayer.ts
        function update() {
            const g = window as unknown as { __playerCount__?: number };
            setCount(g.__playerCount__ ?? null);
        }
        update();
        const id = setInterval(update, 2000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
            <div
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono text-cyan-300 border border-cyan-500/30"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', textShadow: '0 0 8px #0ff' }}
            >
                <span className="w-2 h-2 rounded-full bg-green-400 shadow shadow-green-400/60 animate-pulse inline-block" />
                {count === null ? 'Connecting…' : `${count} player${count === 1 ? '' : 's'} online`}
            </div>
        </div>
    );
}

function HealthBar() {
    const [health, setHealth] = useState(100);
    const [max, setMax]       = useState(100);

    useEffect(() => {
        function update() {
            const g = window as unknown as { __playerHealth__?: number; __playerMaxHealth__?: number };
            if (typeof g.__playerHealth__ === 'number') setHealth(g.__playerHealth__);
            if (typeof g.__playerMaxHealth__ === 'number') setMax(g.__playerMaxHealth__);
        }
        update();
        const id = setInterval(update, 250);
        return () => clearInterval(id);
    }, []);

    const pct = Math.max(0, Math.min(100, (health / max) * 100));
    const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="fixed bottom-4 left-4 z-20 pointer-events-none select-none">
            <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            >
                <span className="text-red-400 text-sm">❤</span>
                <div className="w-40 h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                        className={`h-full rounded-full ${barColor} transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="text-xs font-mono text-white/80 w-8 text-right">{Math.round(health)}</span>
            </div>
        </div>
    );
}

/**
 * Pause menu — desktop only. Appears when pointer lock is released (Esc)
 * after having played, i.e. not during the initial loading screen.
 */
function PauseMenu({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
    const [paused, setPaused] = useState(false);
    const everLocked = useRef(false);
    const navigate = useNavigate();

    useEffect(() => {
        function onLockChange() {
            const locked = document.pointerLockElement !== null;
            if (locked) {
                everLocked.current = true;
                setPaused(false);
            } else if (everLocked.current) {
                setPaused(true);
            }
        }
        document.addEventListener('pointerlockchange', onLockChange);
        return () => document.removeEventListener('pointerlockchange', onLockChange);
    }, []);

    function resume() {
        setPaused(false);
        containerRef.current?.querySelector('canvas')?.requestPointerLock();
    }

    if (!paused) return null;

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" style={{ backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-center gap-4 bg-gray-900/90 border border-white/15 rounded-xl px-12 py-10 shadow-2xl">
                <h2 className="text-2xl font-bold tracking-widest text-white font-mono">PAUSED</h2>
                <button
                    onClick={resume}
                    className="w-48 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                    Resume
                </button>
                <button
                    onClick={() => navigate(ROUTES.GAME_SETTINGS)}
                    className="w-48 px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium transition-colors"
                >
                    Settings
                </button>
                <button
                    onClick={() => navigate('/')}
                    className="w-48 px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium transition-colors"
                >
                    Leave game
                </button>
                <p className="text-xs text-white/40 font-mono">Esc released the mouse — click Resume to continue</p>
            </div>
        </div>
    );
}

type DebugInfo = {
    fps?: number;
    x?: number; y?: number; z?: number;
    yaw?: number; pitch?: number;
    onGround?: boolean;
    role?: string;
    colliders?: number;
};

/** Dev-only debug HUD — shows live position, fps and world state. */
function DebugHud() {
    const [info, setInfo] = useState<DebugInfo>({});

    useEffect(() => {
        function update() {
            const g = window as unknown as { __debug__?: DebugInfo };
            setInfo(g.__debug__ ?? {});
        }
        const id = setInterval(update, 100);
        return () => clearInterval(id);
    }, []);

    const n = (v: number | undefined, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '—');

    return (
        <div className="fixed top-3 right-3 z-30 pointer-events-none select-none">
            <div
                className="px-3 py-2 rounded-lg border border-lime-500/30 text-[11px] leading-relaxed font-mono text-lime-300"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', textShadow: '0 0 6px #0f0' }}
            >
                <div className="font-bold text-lime-400 mb-0.5">DEBUG</div>
                <div>fps: {n(info.fps, 0)}</div>
                <div>pos: {n(info.x)}, {n(info.y)}, {n(info.z)}</div>
                <div>yaw: {n(info.yaw)}  pitch: {n(info.pitch)}</div>
                <div>ground: {info.onGround ? 'yes' : 'no'}</div>
                <div>role: {info.role ?? '—'}</div>
                <div>colliders: {info.colliders ?? '—'}</div>
            </div>
        </div>
    );
}

export default function Game() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [tapToStart, setTapToStart] = useState(device.isMobile);

    // Registers this device in Firestore and claims the player/spectator
    // role — main.ts awaits the result (whenRoleKnown) before starting.
    const session = useDevice();

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
        let cancelled = false;
        import('../../main.js').then(({ startGame }) => {
            // Effect was cleaned up (e.g. StrictMode remount) before the
            // module finished loading — don't start a zombie instance.
            if (cancelled) return;
            cleanup = startGame(container);
        }).catch(err => {
            console.error('[Game] Failed to load game module:', err);
        });

        return () => { cancelled = true; cleanup?.(); };
    }, []);

    return (
        <div className="fixed inset-0 bg-black overflow-hidden">
            {/* Three.js canvas goes here */}
            <div ref={containerRef} className="absolute inset-0" />
            {device.isMobile && !tapToStart && <MobileControls />}

            {/* Top-center online bar */}
            {!tapToStart && <OnlineBar />}

            {/* Spectator mode badge */}
            {session?.role === 'spectator' && (
                <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
                    <div className="px-3 py-1 rounded-full text-xs font-mono text-amber-300 border border-amber-500/30"
                        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
                        Spectator mode — game running on another device
                    </div>
                </div>
            )}

            {/* Bottom-left health bar */}
            {!tapToStart && <HealthBar />}

            {/* Pause menu – desktop only (pointer-lock based) */}
            {!device.isMobile && <PauseMenu containerRef={containerRef} />}

            {/* Debug HUD – local dev only */}
            {import.meta.env.DEV && !tapToStart && <DebugHud />}

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

            {/* Auth panel */}
            <div id="auth-panel" className="fixed top-4 left-4 flex items-center gap-2 pointer-events-auto z-10 font-mono">
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
                        <img id="user-photo" alt="avatar" className="w-7 h-7 rounded-full object-cover" />
                        <span id="user-name" className="text-xs text-cyan-300" />
                        <button id="sign-out-btn" className="text-xs text-white/50 hover:text-white underline pointer-events-auto">
                            Sign out
                        </button>
                    </div>
                </div>

            {/* Crosshair */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none">
                <div className="absolute left-[9px] top-0 w-[2px] h-full bg-white/70" />
                <div className="absolute top-[9px] left-0 h-[2px] w-full bg-white/70" />
            </div>

            {/* Info bar – desktop only */}
            {!device.isMobile && (
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
