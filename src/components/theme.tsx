"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "rf-theme";

/**
 * Runs before the page paints (inlined in <head>), so a dark-mode visitor never sees a white flash.
 * Keep in sync with apply() below.
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${KEY}")||"system";var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

function apply(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark ? "dark" : "light";
}

const Ctx = createContext<{
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
}>({
  choice: "system",
  resolved: "light",
  setChoice: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let c: ThemeChoice = "system";
    try {
      c = (localStorage.getItem(KEY) as ThemeChoice) || "system";
    } catch {}
    setChoiceState(c);
    setResolved(apply(c));
  }, []);

  // Following the system: switch when the OS does.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setResolved(apply("system"));
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    setChoiceState(c);
    // Swap colors in one frame rather than animating every transition at once.
    document.documentElement.classList.add("rf-theme-switching");
    setResolved(apply(c));
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.documentElement.classList.remove("rf-theme-switching"),
      ),
    );
  }, []);

  return (
    <Ctx.Provider value={{ choice, resolved, setChoice }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
