import { useState, type FormEvent } from "react";
import { button, input } from "../ui";
import { createTag, type Tag } from "../../services/problems";

export default function TagManager({ tags, onChanged }: { tags: Tag[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await createTag({ name, slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
      setMsg({ ok: true, text: `Tag "${name}" created` });
      setName("");
      setSlug("");
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap gap-3">
        <input className={`${input} flex-1`} placeholder="Name (Dynamic Programming)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={`${input} flex-1`} placeholder="Slug (auto if empty)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <button className={button}>Add tag</button>
      </form>
      {msg && <p className={msg.ok ? "text-emerald-400" : "text-rose-400"}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => <span key={t.slug} className="rounded-full border border-slate-700 px-3 py-1 text-sm">{t.name} <span className="text-slate-500">{t.slug}</span></span>)}
      </div>
    </div>
  );
}
