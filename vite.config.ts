import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [tailwindcss()],
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
        port: 3000,
        proxy: {
            '/api':       { target: 'https://zulu-wars.vercel.app', changeOrigin: true, secure: true },
            '/socket.io': { target: 'https://zulu-wars.vercel.app', changeOrigin: true, secure: true, ws: true },
            '/world':     { target: 'https://zulu-wars.vercel.app', changeOrigin: true, secure: true },
        },
    },
});
