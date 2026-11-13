"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next = "/projects", heading = "Sign in to Realframe" }: { next?: string; heading?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const supabase = createClient();
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (error) {
      setState("error");
      setError(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
      <h1 className="font-display text-2xl font-bold">{heading}</h1>
      {state === "sent" ? (
        <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-1">We sent a sign-in link to {email}. It expires in an hour.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-semibold">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="min-h-12 rounded-lg border border-stone-300 px-3.5 text-[15px] outline-none focus:border-ember-700"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="min-h-12 rounded-lg bg-ember-700 text-[15px] font-semibold text-white hover:bg-ember-800 disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
