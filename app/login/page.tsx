"use client"

import { useState, useEffect, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

type Mode = "login" | "signup"

function FloatingOrb({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute rounded-full blur-3xl opacity-30",
        className,
      )}
    />
  )
}

function InputField({
  id,
  label,
  type: baseType,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon: Icon,
  showToggle,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  icon: typeof Mail
  showToggle?: boolean
}) {
  const [show, setShow] = useState(false)
  const type = showToggle ? (show ? "text" : "password") : baseType

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className={cn(
            "w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60",
            "outline-none ring-0 transition-shadow focus:border-brand/60 focus:ring-2 focus:ring-brand/25",
            showToggle && "pr-10",
          )}
        />
        {showToggle && (
          <button
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { authState, signIn, signUp } = useAuth()
  const router = useRouter()

  // Optional post-auth destination (?next=/join/abc): only same-origin
  // relative paths, so an invite link can bring the visitor back here.
  function nextPath(): string | null {
    try {
      const raw = new URLSearchParams(window.location.search).get("next")
      if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw
    } catch {
      // No usable return path — fall through to the default below.
    }
    return null
  }

  useEffect(() => {
    if (authState.status === "authenticated") {
      router.replace(nextPath() ?? "/home")
    }
  }, [authState.status, router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result =
        mode === "login"
          ? await signIn(email, password)
          : await signUp(firstName, lastName, email, password)
      if (result.ok) {
        router.push(nextPath() ?? "/home")
      } else {
        if (mode === "login") {
          setError("Wrong email/password.")
        } else {
          setError(result.error ?? "Something went wrong.")
        }
      }
    })
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Background decorative orbs */}
      <FloatingOrb className="size-[500px] bg-gradient-to-br from-brand to-lavender -top-40 -right-32" />
      <FloatingOrb className="size-[400px] bg-gradient-to-tr from-sky to-lavender bottom-0 -left-24" />
      <FloatingOrb className="size-[300px] bg-gradient-to-br from-brand/40 to-sky/40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/icon-512.png"
              alt="et-alicite logo"
              className="size-12 rounded-2xl object-cover shadow-lg shadow-brand/30"
            />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              et-alicite
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Research workspace for student teams
            </p>
          </div>
        </div>

        {/* Auth card */}
        <div className="overflow-hidden rounded-3xl border border-border bg-card/80 shadow-xl backdrop-blur-xl">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                id={`tab-${m}`}
                onClick={() => switchMode(m)}
                className={cn(
                  "flex-1 py-3.5 text-sm font-medium transition-colors",
                  mode === m
                    ? "border-b-2 border-brand text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6 sm:p-8">
            {/* Heading */}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {mode === "login" ? "Welcome back" : "Join et-alicite"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Sign in to continue to your research workspace."
                  : "Create your account and start organising your research."}
              </p>
            </div>

            {/* Fields */}
            <div className="flex flex-col gap-4">
              {mode === "signup" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InputField
                    id="auth-first-name"
                    label="First name"
                    type="text"
                    value={firstName}
                    onChange={setFirstName}
                    placeholder="e.g. Maria"
                    autoComplete="given-name"
                    icon={User}
                  />
                  <InputField
                    id="auth-last-name"
                    label="Last name"
                    type="text"
                    value={lastName}
                    onChange={setLastName}
                    placeholder="e.g. Santos"
                    autoComplete="family-name"
                    icon={User}
                  />
                </div>
              )}
              <InputField
                id="auth-email"
                label="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@university.edu"
                autoComplete="email"
                icon={Mail}
              />
              <InputField
                id="auth-password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                icon={Lock}
                showToggle
              />
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              id="auth-submit"
              disabled={isPending}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all",
                "bg-gradient-to-r from-brand to-lavender shadow-md shadow-brand/25",
                "hover:opacity-90 hover:shadow-lg hover:shadow-brand/30 active:scale-[0.99]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isPending ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </>
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </button>

            {/* Switch mode hint */}
            <p className="text-center text-xs text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="font-medium text-brand hover:underline"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="font-medium text-brand hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          et-alicite · Web-based AI Research Organizer
        </p>
      </div>
    </div>
  )
}
