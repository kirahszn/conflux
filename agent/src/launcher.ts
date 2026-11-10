// Runs several agents as separate child processes (one codebase, independent processes):
//   AGENTS=research,security,market node src/launcher.ts      (npm run agents:all)
// Each child gets the shared env plus ONLY its own <NAME>_* variables (another agent's
// key never reaches it). Crashed children are restarted with backoff. Logs are prefixed.
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";

const names = (process.env.AGENTS ?? "research,security,market")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const prefixOf = (n: string) => `${n.toUpperCase().replace(/-/g, "_")}_`;
const allPrefixes = names.map(prefixOf);
const entry = join(import.meta.dirname, "index.ts");
const children = new Map<string, ChildProcess>();
let shuttingDown = false;
const say = (msg: string) => console.log(`${new Date().toISOString()} [launcher] ${msg}`);

function childEnv(name: string): NodeJS.ProcessEnv {
  const own = prefixOf(name);
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (allPrefixes.some((p) => k.startsWith(p)) && !k.startsWith(own)) continue; // other agents' vars
    env[k] = v;
  }
  env.AGENT_NAME = name;
  return env;
}

function pipe(stream: NodeJS.ReadableStream | null, name: string, toErr: boolean) {
  if (!stream) return;
  createInterface({ input: stream }).on("line", (line) => (toErr ? console.error : console.log)(`[${name}] ${line}`));
}

function start(name: string, failures = 0) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", entry, name], {
    env: childEnv(name),
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(name, child);
  say(`started ${name} (pid ${child.pid})`);
  pipe(child.stdout, name, false);
  pipe(child.stderr, name, true);
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    const healthy = Date.now() - startedAt > 60_000; // ran a minute: reset backoff
    const n = healthy ? 0 : failures + 1;
    const delay = Math.min(60_000, 2000 * 2 ** Math.max(0, n - 1));
    say(`${name} exited (code ${code}, signal ${signal}) — restarting in ${delay / 1000}s`);
    setTimeout(() => !shuttingDown && start(name, n), delay);
  });
}

function shutdown(sig: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  say(`${sig}: stopping ${children.size} agent(s)`);
  for (const c of children.values()) c.kill("SIGTERM");
  const t = setTimeout(() => process.exit(0), 10_000);
  const check = setInterval(() => {
    if (children.size === 0) {
      clearInterval(check);
      clearTimeout(t);
      process.exit(0);
    }
  }, 200);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

say(`starting agents: ${names.join(", ")}`);
for (const n of names) start(n);
