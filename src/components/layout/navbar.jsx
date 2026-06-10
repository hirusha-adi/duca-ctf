import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { NavbarPoints } from "@/components/layout/navbar-points";
import { NavbarMobileMenu } from "@/components/layout/navbar-mobile-menu";

const navLinks = [
  { href: "/competitions", label: "Competitions" },
  { href: "/solves", label: "Solves" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/writeups", label: "Writeups" },
];

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Lock className="h-5 w-5 text-primary" />
            <span>DUCA CTF</span>
          </Link>
          <nav className="hidden items-center gap-4 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <Link
                href="/support"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Support
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="text-sm text-primary transition-colors hover:text-primary/80"
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden items-center gap-2 md:flex">
                <span className="text-sm text-muted-foreground">
                  {user.name || user.email}
                </span>
                <NavbarPoints />
              </div>
              <NavbarPoints className="md:hidden" />
              <form action="/api/auth/logout" method="POST" className="hidden md:block">
                <Button type="submit" variant="outline" size="sm">
                  Logout
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Login</Link>
            </Button>
          )}
          <NavbarMobileMenu
            links={navLinks}
            user={
              user
                ? { name: user.name, email: user.email, role: user.role }
                : null
            }
          />
        </div>
      </div>
    </header>
  );
}
