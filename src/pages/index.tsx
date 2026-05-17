import { Play } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import isMobile from '../lib/isMobile';

export default function Home() {
    const navigate = useNavigate();

    function handlePlay() {
        if (isMobile) {
            const el = document.documentElement;
            el.requestFullscreen?.().catch(() => {});
            const orientation = screen.orientation as ScreenOrientation & {
                lock?: (o: string) => Promise<void>;
            };
            orientation.lock?.('landscape').catch(() => {});
        }
        navigate('/game');
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4 bg-gray-950">
            <h1 className="text-5xl font-bold text-white tracking-tight">Marching Cubes</h1>
            <p className="text-gray-400 max-w-md text-lg">
                A procedurally generated 3D voxel world built with Three.js and marching cubes.
            </p>
            <div className="flex gap-3">
                <button
                    onClick={handlePlay}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                >
                    <Play size={18} />
                    Play
                </button>
            </div>
        </div>
    );
}

