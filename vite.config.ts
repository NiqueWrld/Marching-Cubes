import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    publicDir: 'public',

    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                game: resolve(__dirname, 'game/index.html'),
            },
        },
    },

    server: {
        port: 5173,
        proxy: {
            '/api':       { target: 'http://localhost:3000', changeOrigin: true },
            '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
        },
    },
});
