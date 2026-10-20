"use client";

export function RetryButton() {
  return (
    <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:brightness-110" onClick={() => window.location.reload()}>Reintentar</button>
  );
}
