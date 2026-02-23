import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  input: 'src/StringSegment.ts',
  output: {
    dir: 'dist/esm',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
    entryFileNames: '[name].js',
    sourcemap: true
  },
  external: [
    /^node:/,
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {})
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.esm.json',
      declaration: false,
      declarationMap: false,
      sourceMap: true,
      removeComments: true
    })
  ]
});
