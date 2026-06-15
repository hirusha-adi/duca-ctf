import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { adminLinks } from "@/lib/admin-links";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="sticky top-20 space-y-1">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <AdminMobileNav />
        {children}
      </div>
    </div>
  );
}
