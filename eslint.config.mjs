import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config({
  linterOptions: {
    reportUnusedDisableDirectives: 'error',
  },
  files: [
    'src/**/*.{js,ts,mjs,cjs,tsx,jsx}',
    'test/**/*.{js,ts,mjs,cjs,tsx,jsx}',
    'tests/**/*.{js,ts,mjs,cjs,tsx,jsx}',
    'testsGpt/**/*.{js,ts,mjs,cjs,tsx,jsx}',
    'scripts/**/*.{js,ts,mjs,cjs,tsx,jsx}',
    '*.config.{js,ts,mjs}',
  ],
  ignores: [
    '**/*.generated.ts',
    'dist/**/*',
    'dist-types/**/*',
    'node_modules/**/*',
    '**/*.js', // Ignore all .js files to avoid linting compiled code
  ],
  extends: [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettierRecommended,
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-this-alias': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        args: 'none',
        varsIgnorePattern: '^_',
      },
    ],
  },
});
