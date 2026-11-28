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

Production is the AWS Lightsail server (https://app.ceofactory.vc, API https://api.ceofactory.vc;
Vercel and Render retired 2026-11-28). The server follows GitHub `main` by itself
(`TM/lightsail/tm-autodeploy.sh`): it builds with `VITE_API_HOST=https://api.<base>` and serves
`dist/` from nginx, which also sends every unknown path to `index.html` (deep links and refreshes
work only because of that) and sets the `/cf_crm/` and `/crm-sw.js` headers. Those live in
`TM/lightsail/tm-deploy.sh`, not in this repo. `node lightsail/prod.mjs wait-deploy` (from TM)
confirms a push is live.

Getting `VITE_API_HOST` wrong takes production down silently: the app still loads and every
request fails. A new API host must also be added to the CSP `connect-src` in
`public/cf_crm/app.html`.
