import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...pluginVue.configs['flat/essential'],
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Directory-style components (Button/index.vue, Dialog/index.vue) and names
      // carried over verbatim from the React original (Panel) trip this rule.
      'vue/multi-word-component-names': 'off',
      // The port keeps the original React prop names (onXxx) as callback props,
      // which are intentionally not declared as emits.
      'vue/no-mutating-props': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
