import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        sourcemap: true,
        // rollupOptions: {
        //     input: 'src/main.ts',
        //     output: {
        //         sourcemap: true,
        //     },
        // },
    },
    css: {
        preprocessorOptions: {
           scss: {
             silenceDeprecations: [
               'import',
               'mixed-decls',
               'color-functions',
               'global-builtin',
             ],
           },
        },
     }
});
