"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { adminLinks } from "@/lib/admin-links";
import { cn } from "@/lib/utils";

export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const activeLink =
    adminLinks.find((link) =>
      link.href === "/admin"
        ? pathname === "/admin"
        : pathname === link.href || pathname.startsWith(`${link.href}/`)
    ) ?? adminLinks[0];

  useEffect(() => {
    if (!open) return;

    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="sticky top-14 z-40 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
        aria-label={open ? "Close admin menu" : "Open admin menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Menu className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Admin
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            {activeLink.label}
          </span>
        </span>
        {open ? (
          <X className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <nav className="mt-2 space-y-1 rounded-md border border-border bg-background p-2 shadow-lg">
          {adminLinks.map((link) => {
            const isActive =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setOpen(false)}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
