import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { button, input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to start solving.">
      <form onSubmit={onSubmit} className="space-y-4">
        <input className={input} placeholder="Username or email" aria-label="Username or email" autoComplete="username" autoFocus
          value={username} onChange={(e) => setUsername(e.target.value)} required />
        <div className="relative">
          <input className={`${input} pr-16`} type={show ? "text" : "password"} placeholder="Password" aria-label="Password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-2 text-xs text-slate-400 hover:text-amber-400">
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {error && <p role="alert" className="animate-pop text-sm text-rose-400">{error}</p>}
        <button disabled={busy} className={`${button} w-full`}>{busy ? "Signing in..." : "Log in"}</button>
      </form>
      <p className="text-center text-sm text-slate-400">
        New here? <Link to="/register" className="text-amber-400 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
