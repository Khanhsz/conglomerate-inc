import tseslint from 'typescript-eslint';

// Determinism (CLAUDE.md): sim-core không được dùng nguồn ngẫu nhiên / thời gian thực.
const simCoreDeterminism = {
  files: ['packages/sim-core/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-properties': [
      'error',
      { object: 'Math', property: 'random', message: 'Dùng ctx.rng(stream) thay cho Math.random.' },
      { object: 'Date', property: 'now', message: 'Dùng state.clock thay cho Date.now.' },
      { object: 'performance', property: 'now', message: 'Dùng state.clock thay cho performance.now.' },
    ],
    'no-restricted-syntax': [
      'error',
      { selector: "NewExpression[callee.name='Date']", message: 'Dùng state.clock thay cho new Date().' },
    ],
  },
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'out/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  simCoreDeterminism,
);
