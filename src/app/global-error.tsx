"use client";
import { useReportError } from "@/components/errors/ErrorScreen";

/**
 * Shown when the root layout itself fails. It replaces the whole document, so it carries its
 * own minimal styles rather than the app's.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useReportError(error);
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fffaf5",
          color: "#1c1917",
        }}
      >
        <title>Something went wrong · Realframe</title>
        <main style={{ maxWidth: 380, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#57534e", lineHeight: 1.5 }}>
            Realframe didn&apos;t load. We&apos;ve logged it. Try again, and if
            it keeps happening, let us know
            {digest ? ` and mention ${digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              borderRadius: 999,
              border: 0,
              background: "#be185d",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
