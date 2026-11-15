import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  GenerationError,
  billableInput,
  fakeAiEnabled,
  isAbort,
} from "@/lib/ai";
import {
  componentName,
  parseFiles,
  type ExportFile,
  type ExportFormat,
} from "@/lib/export";

const FILE_RULES = `Return every file in this exact form, one after another, and nothing else:
<file path="relative/path.ext">
...the whole file...
</file>
Paths are relative to the project root. No commentary, no markdown fences around files.`;

const SYSTEM = `You are Realframe's export engineer. You turn a working HTML prototype, or a part of one,
into clean, idiomatic front-end code a developer can drop into their app.

Rules:
- Keep it looking and behaving exactly like the source: same layout, spacing, type, colours, copy and interactions.
- TypeScript, function components, no class components, no external UI libraries.
- Accessible markup: real buttons and links, labels on inputs, alt text.
- Mock data stays inline as typed constants; never call real APIs.
- Leave out anything Realframe-specific: data-rf attributes and comment or review UI.
${FILE_RULES}`;

function request(
  format: ExportFormat,
  src: { name: string; html: string; css: string; brief?: string | null },
) {
  const brief = src.brief
    ? `\n\nThe team's design system, to map colours, type and spacing onto where they match:\n${src.brief}`
    : "";
  if (format === "react")
    return `Convert this single-file prototype into a Vite + React 19 + TypeScript + Tailwind CSS v4 project.

Files to write:
- package.json (scripts dev, build, preview; dependencies react, react-dom; devDependencies vite, @vitejs/plugin-react, typescript, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom)
- vite.config.ts, tsconfig.json, index.html, src/main.tsx, src/App.tsx
- src/index.css with @import "tailwindcss" and an @theme block for the prototype's colours and fonts
- one file per meaningful section or repeated piece under src/components/, and src/data.ts for mock data
- README.md: what's in the project and how to run it (npm install, npm run dev)
Move the prototype's inline JavaScript into React state and handlers. Hash routes become a small state-based router in App.tsx.${brief}

<prototype name="${src.name}">
${src.html}
</prototype>`;

  const name = componentName(src.name);
  const common = `The source element and the CSS rules that apply to it are below. Repeated content (cards, rows, items) becomes typed props, and a ${name}.example.tsx file renders the component with the original content.${brief}

<element name="${src.name}">
${src.html}
</element>
<css>
${src.css}
</css>`;
  if (format === "part-react")
    return `Turn this element into a React component: ${name}.tsx with a typed Props interface, styled by ${name}.module.css (only the rules it needs, class names made readable).\n\n${common}`;
  return `Turn this element into a React component styled only with Tailwind CSS v4 utility classes: ${name}.tsx with a typed Props interface and no stylesheet. Use arbitrary values only where no utility fits.\n\n${common}`;
}

/** Runs an AI export. Throws GenerationError (with the tokens used) when it can't finish. */
export async function exportWithAi(
  format: ExportFormat,
  src: { name: string; html: string; css: string; brief?: string | null },
  deadline = Date.now() + 260_000,
): Promise<{ files: ExportFile[]; usage: { input: number; output: number } }> {
  if (fakeAiEnabled()) {
    const name = componentName(src.name);
    return {
      files:
        format === "react"
          ? [
              { path: "package.json", content: '{ "name": "export" }\n' },
              {
                path: "src/App.tsx",
                content: "export default function App() { return null; }\n",
              },
            ]
          : [
              {
                path: `${name}.tsx`,
                content: `export function ${name}() { return null; }\n`,
              },
            ],
      usage: { input: 10, output: 10 },
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const client = new Anthropic({ apiKey });
  const model = process.env.REALFRAME_CODEGEN_MODEL || "claude-sonnet-5-5";
  let message;
  try {
    message = await client.messages
      .stream(
        {
          model,
          max_tokens: 32000,
          system: SYSTEM,
          messages: [{ role: "user", content: request(format, src) }],
        },
        { signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) },
      )
      .finalMessage();
  } catch (e) {
    if (isAbort(e))
      throw new GenerationError(
        "The export took too long and was stopped, so it wasn't charged. Export a smaller part, or use the ZIP.",
        { input: 0, output: 0 },
      );
    throw e;
  }
  const usage = {
    input: billableInput(message.usage),
    output: message.usage?.output_tokens ?? 0,
  };
  if (message.stop_reason === "max_tokens")
    throw new GenerationError(
      "This prototype is too big to convert in one go. Export a section instead, or use the ZIP.",
      usage,
    );
  const text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const files = parseFiles(text);
  if (!files.length)
    throw new GenerationError("The export came back empty. Try again.", usage);
  return { files, usage };
}
