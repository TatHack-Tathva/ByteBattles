import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { button, input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { register } from "../services/auth";

export default function RegisterPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (isAuthenticated) return <Navigate to="/" replace />;

  // Mirror the backend rules so people get instant feedback (the server still validates).
  const problem =
    !/^[a-zA-Z0-9_]{3,20}$/.test(f.username) ? (f.username ? "Username: 3-20 letters, numbers or underscores" : null)
    : f.password && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(f.password) ? "Password: at least 8 characters with a letter and a number"
    : f.confirm && f.confirm !== f.password ? "Passwords don't match"
    : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(f.username, f.email.trim(), f.password, f.confirm);
      await signIn(f.username, f.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join the arena in under a minute.">
      <form onSubmit={onSubmit} className="space-y-3">
        <input className={input} placeholder="Username" aria-label="Username" autoComplete="username" autoFocus value={f.username} onChange={set("username")} required />
        <input className={input} type="email" placeholder="Email" aria-label="Email" autoComplete="email" value={f.email} onChange={set("email")} required />
        <input className={input} type="password" placeholder="Password" aria-label="Password" autoComplete="new-password" value={f.password} onChange={set("password")} required />
        <input className={input} type="password" placeholder="Confirm password" aria-label="Confirm password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} required />
        {(problem || error) && <p role="alert" className="animate-pop text-sm text-rose-400">{error ?? problem}</p>}
        <button disabled={busy || !!problem} className={`${button} w-full`}>{busy ? "Creating..." : "Sign up"}</button>
      </form>
      <p className="text-center text-sm text-slate-400">
        Already registered? <Link to="/login" className="text-amber-400 hover:underline">Log in</Link>
      </p>
    </AuthShell>
  );
}
