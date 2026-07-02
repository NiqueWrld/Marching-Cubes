import { Link } from 'react-router-dom';
import { useSettings } from '../../../context/SettingsContext.js';
import ROUTES from '../../../lib/routes.js';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-800 last:border-0">
            <span className="text-sm text-gray-300">{label}</span>
            {children}
        </div>
    );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
    );
}

export default function Settings() {
    const { settings, update, reset } = useSettings();

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6">
            <div className="max-w-md mx-auto flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <Link to={ROUTES.GAME} className="text-sm text-gray-400 hover:text-white">← Back to game</Link>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl px-4">
                    <Row label={`Mouse sensitivity (${settings.sensitivity.toFixed(2)}×)`}>
                        <input
                            type="range" min={0.2} max={3} step={0.05}
                            value={settings.sensitivity}
                            onChange={(e) => update('sensitivity', Number(e.target.value))}
                            className="w-40 accent-blue-600"
                        />
                    </Row>
                    <Row label={`Field of view (${settings.fov}°)`}>
                        <input
                            type="range" min={60} max={110} step={1}
                            value={settings.fov}
                            onChange={(e) => update('fov', Number(e.target.value))}
                            className="w-40 accent-blue-600"
                        />
                    </Row>
                    <Row label="Shadows">
                        <Toggle value={settings.shadows} onChange={(v) => update('shadows', v)} />
                    </Row>
                    <Row label="Debug HUD">
                        <Toggle value={settings.debugHud} onChange={(v) => update('debugHud', v)} />
                    </Row>
                </div>

                <button
                    onClick={reset}
                    className="text-sm text-gray-400 hover:text-white self-start"
                >
                    Reset to defaults
                </button>

                <Link
                    to={ROUTES.GAME_SESSIONS}
                    className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium transition-colors text-center"
                >
                    Manage sessions
                </Link>
            </div>
        </div>
    );
}