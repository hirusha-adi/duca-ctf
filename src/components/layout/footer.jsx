import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/rules" className="hover:text-foreground">
            General Rules
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </nav>
        <p>Deakin University Cybersecurity Association</p>
      </div>
    </footer>
  );
}
