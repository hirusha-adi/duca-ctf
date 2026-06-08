import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

function LoginFallback() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-4xl items-center justify-center px-4 py-10">
      <div className="h-64 w-full max-w-lg animate-pulse rounded-xl border border-border bg-card/60" />
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
