import type { Language } from "../services/submissions";

export const LANGUAGES: { value: Language; label: string; monaco: string }[] = [
  { value: "PY", label: "Python", monaco: "python" },
  { value: "CPP", label: "C++", monaco: "cpp" },
  { value: "C", label: "C", monaco: "c" },
  { value: "JS", label: "JavaScript", monaco: "javascript" },
];

export const STARTERS: Record<Language, string> = {
  PY: "a, b = map(int, input().split())\nprint(a + b)\n",
  CPP: "#include <iostream>\nint main() {\n    long long a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << \"\\n\";\n}\n",
  C: "#include <stdio.h>\nint main(void) {\n    long long a, b;\n    scanf(\"%lld %lld\", &a, &b);\n    printf(\"%lld\\n\", a + b);\n    return 0;\n}\n",
  JS: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a + b);\n",
};
