import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

/**
 * Theme state persisted to localStorage under `aedlp-theme`, applying
 * `data-theme` to <html>. Mirrors the prototype useTheme. The initial paint
 * is handled by an inline script in index.html so there is no flash.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("aedlp-theme") as Theme | null) || "light",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aedlp-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}
