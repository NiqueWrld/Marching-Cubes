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
            },
        },
    },

    server: {
        port: 3000,
        proxy: {
            '/api':       { target: 'http://localhost:3001', changeOrigin: true },
            '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
        },
    },
});
