"use client";
import { useEffect } from "react";
import { notify } from "@/lib/toast";

/**
 * Shows a toast passed in the URL (?toast=…) by an action that navigated here, such as
 * "Deleted Dispatch board", then removes it from the address bar.
 */
export function FlashToast() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const message = url.searchParams.get("toast");
    if (!message) return;
    notify.success(message.slice(0, 120));
    url.searchParams.delete("toast");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  return null;
}
