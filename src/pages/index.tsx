import { SignIn, Play } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
            <h1 className="text-4xl font-bold">Marching Cubes</h1>
            <p className="text-gray-500 max-w-md">
                A procedurally generated 3D voxel world built with Three.js and marching cubes.
            </p>
            <div className="flex gap-3">
                <button onClick={() => navigate('/login')} className="btn btn-primary flex items-center gap-2">
                    <SignIn size={18} />
                    Sign In
                </button>
                <button onClick={() => navigate('/game')} className="btn btn-secondary flex items-center gap-2">
                    <Play size={18} />
                    Play as Guest
                </button>
            </div>
        </div>
    );
}

