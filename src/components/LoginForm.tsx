"use client";
import { useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  next = "/projects",
  heading = "Sign in or create an account",
}: {
  next?: string;
  heading?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
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
    <div className="w-full max-w-sm rounded-[1.75rem] border border-stone-200/80 bg-card p-6 shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
      <h1 className="font-display text-xl font-bold tracking-tight">
        {heading}
      </h1>
      {state === "sent" ? (
        <div
          role="status"
          className="mt-4 flex gap-3 rounded-2xl bg-emerald-50 p-4 text-[13px] text-emerald-900"
        >
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Check your inbox</p>
            <p className="mt-0.5">
              We sent a link to {email}. It expires in an hour.
            </p>
            <Button
              variant="link"
              size="sm"
              className="mt-2 text-emerald-900"
              onClick={() => setState("idle")}
            >
              Use a different email
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <Label htmlFor="email" className="mb-1.5">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-10"
          />
          <Button
            variant="default"
            size="lg"
            type="submit"
            loading={state === "sending"}
            className="mt-3 w-full"
          >
            {state === "sending" ? "Sending link" : "Continue with email"}
            <ArrowRight />
          </Button>
          <p className="mt-3 text-xs text-stone-500">
            New here? We&apos;ll create your account. No password needed.
          </p>
          {state === "error" && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
