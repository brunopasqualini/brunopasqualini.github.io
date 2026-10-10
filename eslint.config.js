import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const features = ['home', 'missions', 'incidents', 'lab', 'academy', 'journal', 'achievements', 'workspace'];

/** Features may not import each other: they meet in `app/`. */
const featureBoundaries = features.map((f) => ({
  files: [`src/features/${f}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: features.filter((x) => x !== f).map((x) => `@/features/${x}*`), message: 'Features must not import each other; compose them in src/app.' }],
    }],
  },
}));

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // The simulation engine is a pure library: no React, no DOM.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      // numeric solver code keeps readable initialisers that later passes overwrite
      'no-useless-assignment': 'warn',
      'no-restricted-imports': ['error', { patterns: [{ group: ['react', 'react-dom*', '@/features/*', '@/app/*', '@/shared/ui/*'], message: 'src/engine must stay pure TypeScript.' }] }],
    },
  },
  ...featureBoundaries,
);
