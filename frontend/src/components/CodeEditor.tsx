import Editor from "@monaco-editor/react";
import type { Language } from "../services/submissions";
import { LANGUAGES } from "./languages";

interface Props {
  language: Language;
  value: string;
  onChange: (value: string) => void;
}

export default function CodeEditor({ language, value, onChange }: Props) {
  return (
    <Editor
      height="420px"
      theme="vs-dark"
      language={LANGUAGES.find((l) => l.value === language)?.monaco}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={{
        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        autoClosingOvertype: "always",
        autoSurround: "languageDefined",
        bracketPairColorization: { enabled: true },
        minimap: { enabled: false },
        fontSize: 14,
        tabSize: 4,
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
    />
  );
}
