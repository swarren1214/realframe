"use client";
import { useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/** Email sign-up on the marketing page: sends the same magic link as /login. */
export function HeroSignup({ id = "signup" }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/projects")}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      setState("error");
      setError(error.message);
    } else setState("sent");
  }

  if (state === "sent")
    return (
      <p
        role="status"
        className="mt-7 flex max-w-lg items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Check your inbox.</strong> We sent a
          sign-in link to {email}. It expires in an hour.
        </span>
      </p>
    );

  return (
    <form
      id={id}
      onSubmit={submit}
      className="mt-7 flex max-w-lg scroll-mt-24 flex-wrap gap-2.5"
    >
      <label htmlFor={`${id}-email`} className="sr-only">
        Work email
      </label>
      <input
        id={`${id}-email`}
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="min-h-12 flex-[1_1_240px] rounded-full border border-stone-300 bg-card px-5 text-[15px] outline-none focus:border-raspberry-600 focus:ring-2 focus:ring-raspberry-200"
      />
      <Button
        type="submit"
        size="lg"
        variant="default"
        className="min-h-12 rounded-full px-6"
        loading={state === "sending"}
      >
        Start free
        <ArrowRight />
      </Button>
      {state === "error" && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
