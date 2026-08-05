# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

## Analysis enqueue example

After saving a recording and receiving the inserted `id` from the backend, you can enqueue async analysis and poll the job status. This example shows the minimal client flow (use your existing API client/wrapper):

```js
// enqueue analysis
const resp = await fetch("/api/analyze_by_id_async", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: insertedId }),
});
const { job_id } = await resp.json();

// poll status
async function pollStatus(jobId) {
  while (true) {
    const r = await fetch(`/api/analysis_status?job_id=${jobId}`);
    const j = await r.json();
    if (
      j.status &&
      (j.status.status === "finished" || j.status.status === "failed")
    )
      return j;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const final = await pollStatus(job_id);
console.log("analysis finished:", final);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

## Deployment

Vercel builds this repo on push to `main`. Two things in `vercel.json` are load-bearing.

**`build.env.VITE_API_HOST`** is pinned in the repo rather than left to the Vercel
dashboard. Getting it wrong takes production down silently: the app still loads,
and every request fails. It has already happened once — the deployed bundle was
calling `https://multi-app-be.onrender.com`, which is a real, live Render service
but **not ours**. Render appended `-svpc` to our hostname because the bare name
was already taken by a stranger, and the bundle was posting logins to their
server. Keeping the value here means it shows up in a diff instead of living only
in a dashboard nobody opens.

**`rewrites`** sends every path to `index.html`. Without it, a deep link or a page
refresh anywhere except `/` returns a 404, because the routes only exist in the
client-side router.

Do not add explanatory `"//"` keys to `vercel.json`. Vercel validates it against a
strict schema and rejects unknown properties outright — the build fails with
*"should NOT have additional property"* and Vercel keeps serving the last good
bundle, so the site looks fine while every new commit silently fails to deploy.
That is exactly how this file went unnoticed for a day. JSON has no comments;
this section is where the reasoning goes.
