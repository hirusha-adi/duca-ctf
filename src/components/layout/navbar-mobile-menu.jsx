"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NavbarMobileMenu({ links, user }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [open]);

  const menuLinks = [
    ...links,
    ...(user ? [{ href: "/support", label: "Support" }] : []),
    ...(user?.role === "ADMIN"
      ? [{ href: "/admin", label: "Admin", primary: true }]
      : []),
  ];

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="text-muted-foreground"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 top-14 z-40 bg-background/80 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav className="fixed inset-x-0 top-14 z-50 border-b border-border bg-background px-4 py-3 shadow-lg">
            {user && (
              <p className="mb-3 border-b border-border pb-3 text-sm text-muted-foreground">
                Logged in as {user.name || user.email}
              </p>
            )}
            <ul className="space-y-1">
              {menuLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "block rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      link.primary
                        ? "font-medium text-primary"
                        : "text-foreground"
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            {user && (
              <form
                action="/api/auth/logout"
                method="POST"
                className="mt-3 border-t border-border pt-3"
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Logout
                </Button>
              </form>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
