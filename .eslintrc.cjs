/** Minimal ESLint config for the TypeScript + React + Vite stack.
 * NOTE: could not be executed in the build environment used to author
 * this project (no network access to install eslint/@typescript-eslint) —
 * see README "What has and has not been verified." Run `npm run lint`
 * yourself after `npm install` to confirm it's clean.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs", "vite.config.ts"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
