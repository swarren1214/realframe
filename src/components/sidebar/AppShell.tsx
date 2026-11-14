"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export const SIDEBAR_COOKIE = "rf_sidebar";

const Ctx = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export const useSidebar = () => useContext(Ctx);

/** Sidebar plus the padded page area; remembers whether it's collapsed. */
export function AppShell({
  initialCollapsed,
  sidebar,
  children,
}: {
  initialCollapsed: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }, []);
  useEffect(() => {
    // Cmd/Ctrl + \ toggles the sidebar.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return (
    <Ctx.Provider value={{ collapsed, toggle }}>
      {sidebar}
      <div
        className={cn(
          "min-h-screen px-4 pb-16 transition-[padding] duration-(--duration-base) ease-(--ease-out)",
          collapsed ? "lg:pl-[6.5rem]" : "lg:pl-[17rem]",
        )}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}
