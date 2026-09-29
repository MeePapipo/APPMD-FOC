"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        The page could not be loaded. Nothing was saved, so it is safe to try again.
      </p>
      {/* The digest is the only handle support has on the server-side log line. */}
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-5 flex justify-center">
        <Button type="button" onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
