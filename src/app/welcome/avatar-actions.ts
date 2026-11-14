"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";

const MARK = "/storage/v1/object/public/avatars/";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

/** The storage path inside avatars/ for one of this person's photo URLs, or null. */
function ownPath(url: string | null | undefined, userId: string) {
  if (!url) return null;
  const i = url.indexOf(MARK);
  const path =
    i >= 0 ? decodeURIComponent(url.slice(i + MARK.length).split("?")[0]) : "";
  return path.startsWith(`${userId}/`) ? path : null;
}

/** Points the profile at a photo the person just uploaded, and deletes the one it replaces. */
export const setAvatar = action(async (url: string) => {
  const { supabase, user } = await requireUser();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.startsWith(`${base}${MARK}`) || !ownPath(url, user.id))
    throw new Error("That photo didn't upload correctly. Try again.");
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  const old = ownPath(before?.avatar_url, user.id);
  if (old && old !== ownPath(url, user.id))
    await supabase.storage.from("avatars").remove([old]);
  revalidatePath("/", "layout");
});

export const removeAvatar = action(async () => {
  const { supabase, user } = await requireUser();
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  const old = ownPath(before?.avatar_url, user.id);
  if (old) await supabase.storage.from("avatars").remove([old]);
  revalidatePath("/", "layout");
});
