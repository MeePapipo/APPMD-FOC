# pages.dev proxy for the FOC web app

Roche's DNS blocks `*.vercel.app` (it resolves to `sinkhole.secure.roche.com`) but not `*.pages.dev`.
This folder is a tiny Cloudflare Pages worker that forwards every request to the Vercel deployment, so people
open `https://<name>.pages.dev` and Cloudflare, not their machine, talks to Vercel. It stores and caches nothing.

## Deploy (no command line needed)
1. https://dash.cloudflare.com -> **Workers & Pages** -> **Create** -> **Pages** -> **Upload assets**.
2. Project name: anything not already taken, e.g. `md-foc` (this becomes `md-foc.pages.dev`).
3. Upload the **`public`** folder of this directory (it holds only `_worker.js`). **Deploy**.
4. Open `https://<name>.pages.dev` -> the app's login page.

To change the target, add a variable `UPSTREAM` (e.g. `https://appmd-foc.vercel.app`) under the Pages project's
Settings -> Variables and redeploy. Redeploy (upload again) after editing `_worker.js`.

## How it behaves
- Path, query, method, body and cookies are passed through; redirects and the login library's absolute URLs are
  rewritten to the pages.dev host, so the browser never leaves for `vercel.app`.
- `x-forwarded-host` / `x-forwarded-proto` carry the public host.
- Search engines are told not to index it (`x-robots-tag: noindex`).

## Check it works
Sign in, open Dashboard and Calculator, sign out (it must land on `/login` on the pages.dev host, not on vercel.app),
and import a file as admin (uploads go through the proxy too). Tests of the worker logic: `npx vitest run cloudflare-proxy`.
