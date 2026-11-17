import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const variablesPath = path.resolve(__dirname, 'src/styles/variables.scss').replace(/\\/g, '/');

export default defineConfig({
	plugins: [sveltekit()],
	css: {
		preprocessorOptions: {
			scss: {
				additionalData: `@use "${variablesPath}" as *;\n`
			}
		}
	},
	server: {
		fs: {
			// Allow serving files from one level up to the project root
			allow: ['..']
		},
		proxy: {
			'/finetune-api': {
				target: 'http://127.0.0.1:8787',
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/finetune-api/, '')
			},
			'/tutor-api': {
				target: 'http://127.0.0.1:8787',
				changeOrigin: true
			}
		}
	}
});
