"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AttachButton,
  ReferenceTray,
  useReferences,
} from "@/components/references/references";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/components/voice/useVoiceInput";
import { createProject } from "@/app/projects/actions";
import {
  MAX_PROMPT,
  START_PROMPT_KEY,
  nameFromPrompt,
} from "@/lib/prompt-shared";

/**
 * The new-prototype box: describe what to build (or just name it). A
 * description starts the first build as soon as the studio opens.
 */
export function NewPrototypeForm({ controls }: { controls: React.ReactNode }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const left = MAX_PROMPT - text.length;
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);
  const refs = useReferences(userId ? `pending/${userId}` : null);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }
  // Voice: speak the description; "send" or Auto-send creates it.
  const voice = useVoiceInput({
    value: text,
    onChange: (next) => {
      setText(next);
      const el = form.current?.querySelector("textarea");
      if (el) requestAnimationFrame(() => grow(el));
    },
    onSubmit: () => form.current?.requestSubmit(),
    disabled: !userId || pending,
    hotkey: true,
  });

  return (
    <form
      ref={form}
      action={async (fd) => {
        setPending(true);
        try {
          if (nameFromPrompt(text).isPrompt)
            sessionStorage.setItem(
              START_PROMPT_KEY,
              JSON.stringify({
                prompt: text.trim(),
                at: Date.now(),
                references: refs.ready,
              }),
            );
        } catch {}
        await createProject(fd);
      }}
      {...refs.handlers}
      className="glass mt-5 rounded-[1.75rem] p-2 transition-[box-shadow] focus-within:ring-4 focus-within:ring-raspberry-100"
    >
      <ReferenceTray refs={refs} />
      {voice.bar}
      <label htmlFor="new-prompt" className="sr-only">
        Describe a new prototype
      </label>
      <textarea
        id="new-prompt"
        name="prompt"
        required
        rows={1}
        maxLength={MAX_PROMPT}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          grow(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim()) form.current?.requestSubmit();
          }
        }}
        placeholder="Describe a new prototype, or just name it…"
        className="block max-h-80 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-stone-400"
      />
      <div className="flex flex-wrap items-center gap-2 pl-1">
        <AttachButton refs={refs} disabled={!userId || pending} />
        {voice.button}
        {controls}
        <div className="flex-1" />
        {left < 1000 && (
          <span
            className={
              left < 100
                ? "text-xs tabular-nums text-red-700"
                : "text-xs tabular-nums text-stone-500"
            }
          >
            {left.toLocaleString()} left
          </span>
        )}
        <span className="hidden text-xs text-stone-400 sm:inline">
          Shift + Enter for a new line
        </span>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={!text.trim() || refs.uploading}
        >
          <ArrowUp />
          Create
        </Button>
      </div>
    </form>
  );
}
