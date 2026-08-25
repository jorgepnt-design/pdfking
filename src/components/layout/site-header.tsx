"use client";

import { Crown, Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Werkzeuge" },
  { href: "/datenschutz", label: "Datenschutz" },
];

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg font-bold tracking-tight text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 dark:text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white">
            <Crown aria-hidden className="h-4.5 w-4.5" />
          </span>
          CoroaPDF
          <span className="text-[11px] font-medium font-normal tracking-wide text-slate-400 dark:text-slate-500">
            by Jorge
          </span>
        </Link>

        <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggle}
            aria-label={
              theme === "dark" ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln"
            }
            className="ml-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="h-4 w-4" />
            ) : (
              <Moon aria-hidden className="h-4 w-4" />
            )}
          </button>
        </nav>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu aria-hidden className="h-5 w-5" />
          <span className="sr-only">Menü</span>
        </button>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Mobile Navigation"
        className={cn(
          "border-t border-slate-200 bg-white px-4 py-3 sm:hidden dark:border-slate-800 dark:bg-slate-950",
          menuOpen ? "block" : "hidden",
        )}
      >
        <ul className="flex flex-col gap-1">
          {[...NAV_LINKS, { href: "#theme", label: "__theme__" }].map((link) =>
            link.label === "__theme__" ? null : (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              onClick={toggle}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm"
            >
              {theme === "dark" ? "Helles Design" : "Dunkles Design"}
            </button>
          </li>
        </ul>
      </nav>
    </header>
  );
}
