import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  // plain JavaScript: the Chrome extension runs in the browser, the scripts in Node
  {
    files: ['extension/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  },
  {
    files: ['scripts/**/*.mjs', 'tests/fixtures/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  },
  eslintConfigPrettier
)
