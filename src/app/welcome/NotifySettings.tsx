"use client";
import { useMemo, useState } from "react";
import { SwitchRow } from "@/components/ui/switch-row";
import { createClient } from "@/lib/supabase/client";
import { notify } from "@/lib/toast";

type Prefs = {
  comments: boolean;
  reviews: boolean;
  builds: boolean;
  billing: boolean;
};

const ROWS: { key: keyof Prefs; label: string; description: string }[] = [
  {
    key: "comments",
    label: "Comments and replies",
    description: "When someone comments on one of your prototypes.",
  },
  {
    key: "reviews",
    label: "Approvals and change requests",
    description: "Sent right away when a reviewer decides.",
  },
  {
    key: "builds",
    label: "Builds",
    description:
      "Your builds that took over 90 seconds, and builds others ran on your prototypes.",
  },
  {
    key: "billing",
    label: "Usage and billing",
    description:
      "Usage alerts you set in Usage & billing, and when a spend cap is reached.",
  },
];

/** Which notifications also arrive by email. Saves as you toggle. */
export function NotifySettings({
  userId,
  initial,
}: {
  userId: string;
  initial: Prefs;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  async function toggle(key: keyof Prefs, on: boolean) {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    setSaving(key);
    const { error } = await supabase
      .from("profiles")
      .update({ notify_email: next })
      .eq("id", userId);
    setSaving(null);
    if (error) {
      setPrefs(prefs);
      notify.error("Couldn't save that.", { description: error.message });
    }
  }

  return (
    <section
      id="notifications"
      aria-labelledby="notify-title"
      className="w-full max-w-sm space-y-3 rounded-[1.75rem] border border-stone-200/80 bg-card p-6"
    >
      <div>
        <h2 id="notify-title" className="text-[15px] font-semibold">
          Email me about
        </h2>
        <p className="mt-1 text-xs text-stone-600">
          Grouped into one email at most every 15 minutes. Everything also shows
          in your Inbox.
        </p>
      </div>
      {ROWS.map((r) => (
        <SwitchRow
          key={r.key}
          id={`notify-${r.key}`}
          label={r.label}
          description={r.description}
          checked={prefs[r.key]}
          loading={saving === r.key}
          onCheckedChange={(on) => toggle(r.key, on)}
        />
      ))}
    </section>
  );
}
