/**
 * Logs how long a step took (`[perf] <label> <ms>ms`), to find what makes a page slow on the live
 * deployment: Vercel's Logs tab shows these lines per request. Safe to leave in; set PERF_LOG=0 to silence.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (process.env.PERF_LOG === "0") return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label} ${Math.round(performance.now() - start)}ms`);
  }
}
