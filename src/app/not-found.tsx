import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        This page does not exist, or it belongs to another sales rep.
      </p>
      <Link href="/calculator" className="mt-5 text-sm font-medium text-brand hover:underline">
        Back to the calculator
      </Link>
    </main>
  );
}
