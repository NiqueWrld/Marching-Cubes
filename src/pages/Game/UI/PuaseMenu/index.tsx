import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../../../context/SettingsContext.js';

/** In-overlay settings panel — edits apply live via the settings context. */
function SettingsPanel({ onBack }: { onBack: () => void }) {
    const { settings, update, reset } = useSettings();

    return (
        <div className="flex flex-col items-stretch gap-4 bg-gray-900/90 border border-white/15 rounded-xl px-10 py-8 shadow-2xl w-96">
            <h2 className="text-2xl font-bold tracking-widest text-white font-mono text-center">SETTINGS</h2>

            <label className="flex flex-col gap-1 text-sm text-gray-300">
                Mouse sensitivity ({settings.sensitivity.toFixed(2)}×)
                <input
                    type="range" min={0.2} max={3} step={0.05}
                    value={settings.sensitivity}
                    onChange={(e) => update('sensitivity', Number(e.target.value))}
                    className="accent-blue-600"
                />
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-300">
                Field of view ({settings.fov}°)
                <input
                    type="range" min={60} max={110} step={1}
                    value={settings.fov}
                    onChange={(e) => update('fov', Number(e.target.value))}
                    className="accent-blue-600"
                />
            </label>

            <label className="flex items-center justify-between text-sm text-gray-300">
                Shadows
                <input
                    type="checkbox"
                    checked={settings.shadows}
                    onChange={(e) => update('shadows', e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                />
            </label>

            <label className="flex items-center justify-between text-sm text-gray-300">
                Debug HUD
                <input
                    type="checkbox"
                    checked={settings.debugHud}
                    onChange={(e) => update('debugHud', e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                />
            </label>

            <button
                onClick={reset}
                className="text-xs text-gray-400 hover:text-white self-start"
            >
                Reset to defaults
            </button>

            <button
                onClick={onBack}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
                Back
            </button>
        </div>
    );
}

/**
 * Pause menu — desktop only. Appears when pointer lock is released (Esc)
 * after having played, i.e. not during the initial loading screen.
 * Includes the in-game settings panel.
 */
export default function PauseMenu({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
    const [paused, setPaused] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const everLocked = useRef(false);
    const navigate = useNavigate();

    useEffect(() => {
        function onLockChange() {
            const locked = document.pointerLockElement !== null;
            if (locked) {
                everLocked.current = true;
                setPaused(false);
                setShowSettings(false);
            } else if (everLocked.current) {
                setPaused(true);
            }
        }
        document.addEventListener('pointerlockchange', onLockChange);
        return () => document.removeEventListener('pointerlockchange', onLockChange);
    }, []);

    function resume() {
        setPaused(false);
        setShowSettings(false);
        containerRef.current?.querySelector('canvas')?.requestPointerLock();
    }

    if (!paused) return null;

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" style={{ backdropFilter: 'blur(4px)' }}>
            {showSettings ? (
                <SettingsPanel onBack={() => setShowSettings(false)} />
            ) : (
                <div className="flex flex-col items-center gap-4 bg-gray-900/90 border border-white/15 rounded-xl px-12 py-10 shadow-2xl">
                    <h2 className="text-2xl font-bold tracking-widest text-white font-mono">PAUSED</h2>
                    <button
                        onClick={resume}
                        className="w-48 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                    >
                        Resume
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
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
            )}
        </div>
    );
}