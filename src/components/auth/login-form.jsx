"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function safeNextPath(next) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const hidden = Math.max(local.length - 2, 1);
  return `${local.slice(0, 2)}${"•".repeat(Math.min(hidden, 5))}@${domain}`;
}

const STEPS = [
  { id: "email", label: "Email", icon: Mail },
  { id: "code", label: "Verify", icon: KeyRound },
];

function StepIndicator({ step }) {
  const activeIndex = step === "email" ? 0 : 1;

  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((item, index) => {
        const Icon = item.icon;
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;

        return (
          <li key={item.id} className="flex items-center gap-2">
            {index > 0 && (
              <span
                className={cn(
                  "h-px w-6 sm:w-10",
                  isComplete || isActive ? "bg-primary/60" : "bg-border"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : isComplete
                    ? "border-primary/30 text-primary/80"
                    : "border-border text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="font-mono sm:hidden">{index + 1}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AnimatedHeight({ children, deps = [] }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const measure = () => setHeight(el.getBoundingClientRect().height);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit animation triggers
  }, deps);

  return (
    <div
      className="overflow-hidden transition-[height] duration-300 ease-in-out motion-reduce:transition-none"
      style={{ height: height ?? "auto" }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

function BrandPanel({ step }) {
  return (
    <aside className="relative hidden flex-col justify-between border-r border-border bg-secondary/25 p-10 lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(20,184,166,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,184,166,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative">
        <Image
          src="/duca-logo.png"
          alt=""
          width={88}
          height={88}
          className="mb-8 h-[72px] w-[72px] object-contain"
        />
        <h1 className="text-3xl font-bold tracking-tight">
          DUCA <span className="font-mono text-primary">CTF</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Deakin University Cybersecurity Association
        </p>
        <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Passwordless sign-in. We email you a one-time code — no account password to remember.
        </p>
      </div>
      <div className="relative">
        <StepIndicator step={step} />
      </div>
    </aside>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function sendCode(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setMessage(data.message);
      setStep("code");
    } catch {
      setError("Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      if (!data.profileComplete) {
        router.push("/onboarding");
      } else {
        router.push(nextPath);
        router.refresh();
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetToEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setMessage(null);
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-4xl items-center px-4 py-10 sm:py-14">
      <div className="w-full overflow-hidden rounded-xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
        <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <BrandPanel step={step} />

          <div className="p-6 sm:p-10">
            <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
              <div className="flex items-center gap-3">
                <Image
                  src="/duca-logo.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <div>
                  <p className="font-semibold leading-none">
                    DUCA <span className="font-mono text-primary">CTF</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Sign in</p>
                </div>
              </div>
              <StepIndicator step={step} />
            </div>

            <AnimatedHeight deps={[step, error, message, loading]}>
              <div className="mb-6 hidden lg:block">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  {step === "email" ? "Step 1 of 2" : "Step 2 of 2"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {step === "email" ? "Enter your email" : "Check your inbox"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step === "email"
                    ? "We'll send a six-digit code to sign you in."
                    : `Code sent to ${maskEmail(email)}. Expires in 10 minutes.`}
                </p>
              </div>

              {step === "email" ? (
                <form onSubmit={sendCode} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-11 bg-background/60 pl-10"
                        autoComplete="email"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="h-11 w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending code…
                      </>
                    ) : (
                      "Send login code"
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={verifyCode} className="space-y-5">
                  <div className="space-y-2 lg:hidden">
                    <p className="text-sm text-muted-foreground">
                      {message || `Code sent to ${maskEmail(email)}`}
                    </p>
                  </div>

                  {message && (
                    <p className="hidden rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary lg:block">
                      {message}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="code">Login code</Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="h-14 bg-background/60 text-center font-mono text-2xl tracking-[0.45em] sm:text-3xl"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      required
                    />
                    <p className="text-center text-xs text-muted-foreground">
                      Enter the 6-digit code from your email
                    </p>
                  </div>

                  {error && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="h-11 w-full" disabled={loading || code.length < 6}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={resetToEmail}
                    disabled={loading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Use a different email
                  </Button>
                </form>
              )}
            </AnimatedHeight>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
              <Link href="/competitions" className="hover:text-foreground">
                Browse competitions
              </Link>
              <Link href="/" className="hover:text-foreground">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
