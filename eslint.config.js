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
      { selector: "CallExpression[callee.name='Date']", message: 'Dùng state.clock thay cho Date().' },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'crypto', message: 'Dùng ctx.rng(stream); sim-core không dùng nguồn ngẫu nhiên ngoài.' },
      { name: 'performance', message: 'sim-core không đo thời gian thực.' },
    ],
  },
};

// #53: không ép kiểu (`as`), trừ điểm gắn brand Money và biên I/O đã validate bằng Zod. `as const` vẫn được.
const noTypeAssertions = [
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      // `StoreRef | 'all'` ghi rõ giá trị đặc biệt dù về kiểu là thừa.
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    files: ['packages/sim-core/src/money.ts', 'packages/content/src/load.ts'],
    rules: { '@typescript-eslint/consistent-type-assertions': 'off' },
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'out/**', 'coverage/**'] },
  // #53: lint có kiểm kiểu. Danh sách tsconfig tường minh vì worker/test/tools không tên tsconfig.json.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          './packages/sim-core/tsconfig.json',
          './packages/sim-core/tsconfig.test.json',
          './packages/content/tsconfig.json',
          './packages/balance/tsconfig.json',
          './apps/web/tsconfig.json',
          './apps/web/tsconfig.worker.json',
          './tsconfig.tools.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...noTypeAssertions,
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked },
  // File ảo của tests/lint-determinism.test.ts không thuộc tsconfig nào: chỉ chạy luật không cần kiểu.
  { files: ['**/__lint_probe__.ts'], ...tseslint.configs.disableTypeChecked },
  simCoreDeterminism,
);
