'use strict';
/*
 * Z Lift ships as plain <script> files sharing one global scope (no bundler,
 * no modules), so `no-undef` stays off by design — cross-file globals are the
 * architecture, not a bug. What we DO enforce is the correctness class of
 * mistakes a bare script cannot catch for itself: dead code after a return,
 * duplicated object keys, switch fallthrough, self-assignment, NaN misuse.
 * Style is intentionally out of scope; the codebase predates the linter and
 * behavior-preserving is the rule.
 */
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'qa/android-shots/**',
      'qa/android-downloads/**',
      'js/components/qrcode.js', // vendored library, kept as-is
    ],
  },
  {
    files: ['js/**/*.js', 'qa/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
    rules: {
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-assign': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-sparse-arrays': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
