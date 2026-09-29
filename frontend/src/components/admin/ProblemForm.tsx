import { useState, type FormEvent } from "react";
import { button, input } from "../ui";
import { createProblem, type Tag } from "../../services/problems";

const EMPTY = { id: "", title: "", description: "", difficulty: "EASY", constraints: "", sampleIn: "", sampleOut: "", inputDesc: "", outputDesc: "", explanation: "", memory: 256, time: 2, visible: true };

export default function ProblemForm({ tags, onCreated }: { tags: Tag[]; onCreated: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [zip, setZip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof EMPTY, v: string | number | boolean) => setF({ ...f, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!zip) return setMsg({ ok: false, text: "Choose a testcase zip" });
    const fd = new FormData();
    fd.set("id", f.id);
    fd.set("title", f.title);
    fd.set("description", f.description);
    fd.set("difficulty", f.difficulty);
    fd.set("constraints", JSON.stringify(f.constraints.split("\n").map((s) => s.trim()).filter(Boolean)));
    fd.set("tags", JSON.stringify(picked));
    fd.set("sample_io", JSON.stringify({ input: f.sampleIn, output: f.sampleOut }));
    fd.set("input_desc", f.inputDesc);
    fd.set("output_desc", f.outputDesc);
    if (f.explanation) fd.set("explanation", f.explanation);
    fd.set("memory_limit_mb", String(f.memory));
    fd.set("time_limit_sec", String(f.time));
    fd.set("visibility", String(f.visible));
    fd.set("tests_zip", zip);
    setBusy(true);
    try {
      const r = await createProblem(fd);
      setMsg({ ok: true, text: `Created ${r.id} with ${r.testcases} testcases` });
      setF(EMPTY);
      setPicked([]);
      setZip(null);
      onCreated();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <input className={input} placeholder="ID (max 6 chars)" maxLength={6} value={f.id} onChange={(e) => set("id", e.target.value)} required />
      <input className={input} placeholder="Title" value={f.title} onChange={(e) => set("title", e.target.value)} required />
      <textarea className={`${input} md:col-span-2 h-24`} placeholder="Description" value={f.description} onChange={(e) => set("description", e.target.value)} required />
      <select className={input} value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
        {["EASY", "MEDIUM", "HARD"].map((d) => <option key={d}>{d}</option>)}
      </select>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.visible} onChange={(e) => set("visible", e.target.checked)} /> Visible to everyone</label>
      <textarea className={`${input} h-20`} placeholder="Constraints (one per line)" value={f.constraints} onChange={(e) => set("constraints", e.target.value)} required />
      <div className="flex flex-wrap content-start gap-2" role="group" aria-label="Tags">
        {tags.map((t) => (
          <label key={t.slug} className="flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-sm">
            <input type="checkbox" checked={picked.includes(t.slug)} onChange={(e) => setPicked(e.target.checked ? [...picked, t.slug] : picked.filter((s) => s !== t.slug))} /> {t.name}
          </label>
        ))}
        {tags.length === 0 && <span className="text-sm text-slate-400">Create tags first (Tags tab).</span>}
      </div>
      <textarea className={`${input} h-16 font-mono`} placeholder="Sample input" value={f.sampleIn} onChange={(e) => set("sampleIn", e.target.value)} required />
      <textarea className={`${input} h-16 font-mono`} placeholder="Sample output" value={f.sampleOut} onChange={(e) => set("sampleOut", e.target.value)} required />
      <input className={input} placeholder="Input description" value={f.inputDesc} onChange={(e) => set("inputDesc", e.target.value)} required />
      <input className={input} placeholder="Output description" value={f.outputDesc} onChange={(e) => set("outputDesc", e.target.value)} required />
      <input className={input} type="number" min={1} placeholder="Memory limit (MB)" value={f.memory} onChange={(e) => set("memory", +e.target.value)} required />
      <input className={input} type="number" min={1} placeholder="Time limit (s)" value={f.time} onChange={(e) => set("time", +e.target.value)} required />
      <div className="md:col-span-2">
        <input type="file" accept=".zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} aria-label="Testcase zip" />
        <p className="mt-1 text-sm text-slate-400">Zip name must match its top folder: SUM01.zip holds SUM01/inputs/1.txt and SUM01/outputs/1.txt.</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-4">
        <button className={button} disabled={busy}>{busy ? "Uploading" : "Create problem"}</button>
        {msg && <span className={msg.ok ? "text-emerald-400" : "text-rose-400"}>{msg.text}</span>}
      </div>
    </form>
  );
}
