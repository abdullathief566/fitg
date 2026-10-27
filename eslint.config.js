import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    'docs/**',
    'seed/**',
    'reference/**',
    'fixtures/**',
    'data/raw/**',
    'data/out/**',
    'coverage/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Product law: the engine is pure. Time, time zone and randomness are parameters.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'The engine is pure: take `now` as a parameter.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine is pure: take `now` as a parameter.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'The engine is pure: use mulberry32(seed).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'zod', '@fitg/*'],
              message: 'The engine has zero runtime dependencies and does no I/O.',
            },
          ],
        },
      ],
    },
  },
  {
    // The app (design acceptance checks as rules, docs/code_review.md §3).
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      // #1: hex lives only in constants/theme.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9A-Fa-f]{6}\\b/]',
          message: 'Colours come from constants/theme.ts via useTheme(); no hex here.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // #10: haptics only through lib/haptics.ts (it honours the Settings kill switch).
            { name: 'expo-haptics', message: 'Use @/lib/haptics.' },
            // #3: every tappable goes through <Tap>, which enforces the 48 pt minimum.
            {
              name: 'react-native',
              importNames: ['Pressable', 'TouchableOpacity', 'TouchableHighlight'],
              message: 'Use <Tap> from src/ui/Pressable.',
            },
            // motion.md §3 rule 1: worklets only.
            { name: 'react-native', importNames: ['Animated'], message: 'Use react-native-reanimated.' },
            // The package index pulls ~3,800 icons into the bundle.
            { name: 'lucide-react-native', message: 'Import icons from src/ui/icons.ts.' },
          ],
        },
      ],
    },
  },
  {
    // The two places allowed to use a raw Pressable: the Tap primitive itself and a full-screen sheet backdrop.
    files: ['apps/mobile/src/ui/Pressable.tsx', 'apps/mobile/src/ui/NumberSheet.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
