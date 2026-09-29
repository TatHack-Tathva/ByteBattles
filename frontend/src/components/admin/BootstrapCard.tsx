import { useState, type FormEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import { bootstrapAdmin } from "../../services/auth";
import { button, card, input } from "../ui";

// Non-admins land here: the first commander can claim admin with the launch code.
export default function BootstrapCard() {
  const { refreshUser } = useAuth();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const claim = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await bootstrapAdmin(code);
      setMsg({ ok: true, text: r.detail });
      await refreshUser();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={claim} className={`${card} max-w-md animate-fade-up space-y-3 p-5`}>
      <h2 className="text-lg font-bold">Admin access required</h2>
      <p className="text-sm text-slate-400">
        Your account isn't an admin. If this is a fresh deployment, enter the launch code (<code>ADMIN_BOOTSTRAP_TOKEN</code>) to become the first admin.
        Otherwise, ask an existing admin to promote you.
      </p>
      <input className={input} type="password" placeholder="Launch code" aria-label="Launch code" value={code} onChange={(e) => setCode(e.target.value)} required />
      {msg && <p role="status" className={`animate-pop text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>}
      <button className={button} disabled={busy}>{busy ? "Checking..." : "Claim admin"}</button>
    </form>
  );
}
