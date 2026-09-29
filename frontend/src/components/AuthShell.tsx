import type { ReactNode } from "react";

// Shared frame for the login and register screens.
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative w-full max-w-sm animate-fade-up space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div>
          <div className="text-sm font-extrabold tracking-tight">Byte<span className="text-amber-400">Battles</span></div>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
