// No React, browser or type-aware rules: the mod is not React, has no DOM, and
// its engine types are not on npm.
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['plugins/mabl/mod/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      ...prettierConfig.rules,
      curly: ['error', 'multi-line'],
      'no-unexpected-multiline': 'error',
      'no-inner-declarations': [
        'error',
        'functions',
        {blockScopedFunctions: 'disallow'},
      ],
      'no-constant-condition': ['error', {checkLoops: 'all'}],
      'no-console': ['error', {allow: ['warn', 'error']}],
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-var': 'warn',
      'prefer-const': ['warn'],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ExportNamedDeclaration[source.type='Literal']",
          message:
            'Re-exporting from another module is forbidden. Update import locations in consumers instead.',
        },
        {
          selector: 'ExportAllDeclaration',
          message:
            'Re-exporting all from another module is forbidden. Update import locations in consumers instead.',
        },
      ],
      'no-prototype-builtins': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {allowExpressions: true},
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {ignoreRestSiblings: true}],
      '@typescript-eslint/no-use-before-define': [
        'error',
        {functions: false, classes: true, variables: true, typedefs: true},
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': false,
          'ts-ignore': true,
          'ts-nocheck': 'allow-with-description',
          'ts-check': false,
        },
      ],
    },
  },
);
