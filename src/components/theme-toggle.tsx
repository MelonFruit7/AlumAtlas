"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "alum-atlas-theme";
const THEME_COOKIE_KEY = "alum-atlas-theme";

type ThemeMode = "light" | "dark";

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

type Props = {
  initialTheme: ThemeMode;
};

export function ThemeToggle({ initialTheme }: Props) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return initialTheme;
    }

    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === "light" || storedTheme === "dark") {
        return storedTheme;
      }
    } catch {
      // Ignore storage failures in restrictive browsing modes.
    }

    return initialTheme;
  });

  function persistTheme(themeToPersist: ThemeMode) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeToPersist);
      document.cookie = `${THEME_COOKIE_KEY}=${themeToPersist}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Ignore storage failures in restrictive browsing modes.
    }
  }

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className="wgeu-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Theme: ${theme}`}
    >
      <span aria-hidden="true">{theme === "dark" ? "◐" : "◑"}</span>
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
