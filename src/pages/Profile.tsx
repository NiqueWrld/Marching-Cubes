import { usePlayer } from '../hooks/usePlayer.js';

export default function Profile() {
    const { player, loading } = usePlayer();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
                Loading…
            </div>
        );
    }

    if (!player) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
                Not signed in.
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 text-white px-4">
            {player.photoURL && (
                <img src={player.photoURL} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            )}
            <h1 className="text-3xl font-bold">{player.displayName}</h1>
            {player.email && <p className="text-gray-400 text-sm">{player.email}</p>}
            <div className="text-sm text-gray-500 font-mono">
                Last position: {player.position.x.toFixed(1)}, {player.position.y.toFixed(1)}, {player.position.z.toFixed(1)}
            </div>
        </div>
    );
}

