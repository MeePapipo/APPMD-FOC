// Cloudflare Pages "advanced mode" worker: a reverse proxy in front of the Vercel deployment.
//
// Roche's DNS sinkholes *.vercel.app but not *.pages.dev, so people open https://<name>.pages.dev and
// Cloudflare (not their machine) talks to the Vercel app. Nothing is stored here and nothing is cached.
// Set an UPSTREAM variable in the Pages project settings to point at another deployment.
const DEFAULT_UPSTREAM = "https://appmd-foc.vercel.app";

const swap = (text, from, to) => text.split(from).join(to);

const worker = {
  async fetch(request, env) {
    const upstream = new URL((env && env.UPSTREAM) || DEFAULT_UPSTREAM);
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, upstream);

    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", "https");

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Redirects go back to the browser (rewritten below) so it stays on this host.
      redirect: "manual",
    });

    const out = new Headers(response.headers);
    const location = out.get("location");
    if (location) out.set("location", swap(location, upstream.origin, incoming.origin));
    out.set("x-robots-tag", "noindex");

    // The login library answers with absolute URLs built from the host it saw (sign-out redirects there):
    // point them at this host too, or the browser would leave for the blocked address.
    if (incoming.pathname.startsWith("/api/auth/") && (out.get("content-type") || "").includes("application/json")) {
      const body = swap(await response.text(), upstream.origin, incoming.origin);
      out.delete("content-length");
      out.delete("content-encoding");
      return new Response(body, { status: response.status, statusText: response.statusText, headers: out });
    }

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
  },
};

export default worker;
