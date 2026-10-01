import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./public/_worker.js";

const UPSTREAM = "https://appmd-foc.vercel.app";
const HOST = "https://foc-md.pages.dev";

afterEach(() => vi.unstubAllGlobals());

function stubUpstream(response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("pages.dev proxy worker", () => {
  it("forwards the path and query to the Vercel app and tells it the public host", async () => {
    const f = stubUpstream(new Response("ok"));
    const res = await worker.fetch(new Request(`${HOST}/dashboard?year=2026`, { headers: { cookie: "a=1" } }), {});
    const [target, init] = f.mock.calls[0];
    expect(String(target)).toBe(`${UPSTREAM}/dashboard?year=2026`);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.body).toBeUndefined();
    expect(init.headers.get("x-forwarded-host")).toBe("foc-md.pages.dev");
    expect(init.headers.get("x-forwarded-proto")).toBe("https");
    expect(init.headers.get("cookie")).toBe("a=1");
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("passes a POST body through", async () => {
    const f = stubUpstream(new Response(null, { status: 204 }));
    await worker.fetch(new Request(`${HOST}/api/register`, { method: "POST", body: "{\"a\":1}", headers: { "content-type": "application/json" } }), {});
    const init = f.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).not.toBeUndefined();
  });

  it("rewrites a redirect so the browser stays on the proxy host", async () => {
    stubUpstream(new Response(null, { status: 307, headers: { location: `${UPSTREAM}/login` } }));
    const res = await worker.fetch(new Request(`${HOST}/`), {});
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${HOST}/login`);
  });

  it("keeps every Set-Cookie header", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "a=1; Path=/; Secure");
    headers.append("set-cookie", "b=2; Path=/; Secure");
    stubUpstream(new Response("ok", { headers }));
    const res = await worker.fetch(new Request(`${HOST}/api/auth/callback/credentials`, { method: "POST", body: "x" }), {});
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/; Secure", "b=2; Path=/; Secure"]);
  });

  it("points the login library's absolute URLs at the proxy host", async () => {
    stubUpstream(new Response(JSON.stringify({ url: `${UPSTREAM}/login` }), { headers: { "content-type": "application/json", "content-length": "99" } }));
    const res = await worker.fetch(new Request(`${HOST}/api/auth/signout`, { method: "POST", body: "x" }), {});
    expect(await res.json()).toEqual({ url: `${HOST}/login` });
    expect(res.headers.get("content-length")).toBeNull();
  });

  it("leaves other JSON alone and honours an UPSTREAM override", async () => {
    const f = stubUpstream(new Response(JSON.stringify({ link: `${UPSTREAM}/x` }), { headers: { "content-type": "application/json" } }));
    const res = await worker.fetch(new Request(`${HOST}/api/dashboard/account?name=a`), { UPSTREAM: "https://other.example.com" });
    expect(String(f.mock.calls[0][0])).toBe("https://other.example.com/api/dashboard/account?name=a");
    expect(await res.json()).toEqual({ link: `${UPSTREAM}/x` });
  });
});
