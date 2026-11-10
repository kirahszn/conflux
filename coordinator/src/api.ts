import express, { type Request, type Response } from "express";
import { sha256 } from "./hash.ts";
import { checkResult } from "./proof.ts";
import { createPlan, planMatches, PlanError, type Plan } from "./planner.ts";
import { getTask, type Task } from "./near.ts";
import { store } from "./store.ts";

/** Short per-role instruction used in briefs until AI-written briefs exist. */
const ROLE_INSTRUCTIONS: Record<string, string> = {
  research: "Gather and summarise the key facts and sources needed for this task.",
  security: "Review this task for security risks, threats and vulnerabilities.",
  market: "Analyse the market, competitors, pricing and demand relevant to this task.",
};
const instructionFor = (role: string) =>
  ROLE_INSTRUCTIONS[role] ?? `Contribute the "${role}" part of this task.`;

function parseId(raw: unknown): number | null {
  return typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Loads the task from chain, or sends 400/404 and returns null. */
async function loadTask(req: Request, res: Response): Promise<Task | null> {
  const id = parseId(req.params.id);
  if (id === null) return void res.status(400).json({ error: "task id must be a number" }), null;
  const task = await getTask(id);
  if (!task) return void res.status(404).json({ error: `task ${id} not found` }), null;
  return task;
}

function loadSlot(task: Task, req: Request, res: Response): number | null {
  const slot = parseId(req.params.slot);
  if (slot === null || slot >= task.slots.length) {
    res.status(404).json({ error: `slot ${req.params.slot} not found in task ${task.id}` });
    return null;
  }
  return slot;
}

function bodyText(req: Request, res: Response, field: string): string | null {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  if (typeof v !== "string" || v.length === 0) {
    res.status(400).json({ error: `body must be JSON with a non-empty string "${field}"` });
    return null;
  }
  return v;
}

export function createApi() {
  const app = express();
  app.use(express.json({ limit: "5mb" })); // proofs carry raw AI responses (25 KB+ with search)

  // Store a task description, only if it matches the on-chain description_hash.
  app.post("/tasks/:id/description", async (req, res) => {
    const task = await loadTask(req, res);
    if (!task) return;
    const description = bodyText(req, res, "description");
    if (description === null) return;
    const got = sha256(description);
    if (got !== task.description_hash) {
      return res.status(400).json({
        error: "sha256(description) does not match on-chain description_hash",
        expected: task.description_hash,
        got,
      });
    }
    store.saveDescription(task.id, description);
    // Stage 3.5: link the AI plan if the on-chain slots match it exactly.
    const plan = store.plan(got) as Plan | undefined;
    const linked = plan !== undefined && planMatches(plan, task.slots);
    if (linked) store.linkPlan(task.id, got, plan);
    console.log(
      `[api] stored description for task ${task.id}; plan ` +
        (plan === undefined ? "none (generic briefs)" : linked ? "LINKED (tailored briefs)" : "found but slots differ (generic briefs)"),
    );
    res.json({ ok: true, task_id: task.id, description_hash: got, plan_linked: linked });
  });

  // Brief for the agent working on one slot.
  app.get("/tasks/:id/slots/:slot/brief", async (req, res) => {
    const task = await loadTask(req, res);
    if (!task) return;
    const slot = loadSlot(task, req, res);
    if (slot === null) return;
    const description = store.description(task.id);
    if (description === undefined) {
      return res.status(409).json({ error: `description for task ${task.id} not stored yet` });
    }
    const role = task.slots[slot]!.role;
    const plan = store.linkedPlan(task.id) as Plan | undefined;
    const tailored = plan?.slots[slot]?.role === role ? plan.slots[slot]!.brief : undefined;
    res.json({
      task_title: task.title,
      role,
      brief_source: tailored ? "plan" : "generic",
      brief: tailored
        ? `${tailored}\n\nFull task description: ${description}`
        : `You are the ${role} agent. ${instructionFor(role)}\n\nTask: ${description}`,
    });
  });

  // Store a slot result, only if the slot is submitted on-chain and the hash matches.
  app.post("/tasks/:id/slots/:slot/result", async (req, res) => {
    const task = await loadTask(req, res);
    if (!task) return;
    const slot = loadSlot(task, req, res);
    if (slot === null) return;
    const text = bodyText(req, res, "text");
    if (text === null) return;
    const onChain = task.slots[slot]!.result_hash;
    if (!onChain) {
      return res.status(409).json({ error: `slot ${slot} of task ${task.id} is not submitted on-chain yet` });
    }
    const got = sha256(text);
    if (got !== onChain) {
      return res.status(400).json({
        error: "sha256(text) does not match on-chain result_hash",
        expected: onChain,
        got,
      });
    }
    // Stage 3.3: quality gate + optional proof {gather, write}, consistent with the on-chain proof_ref.
    const checked = checkResult(text, task.slots[slot]!.role, (req.body as Record<string, unknown>).proof, task.slots[slot]!.proof_ref);
    if (!checked.ok) {
      console.warn(`[api] REJECTED result for task ${task.id} slot ${slot}: ${checked.error}`);
      return res.status(400).json({ error: `result rejected: ${checked.error}` });
    }
    const proof = checked.value;
    const kinds =
      proof === null ? null
      : "kind" in proof ? { dry_run: true }
      : { gather: proof.gather?.kind ?? null, write: proof.write.kind };
    store.saveResult(task.id, slot, text, proof);
    console.log(
      `[api] stored result for task ${task.id} slot ${slot} (${text.length} chars, passes quality gate), proof ${JSON.stringify(kinds)}` +
        (proof && !("kind" in proof) ? ` write signer ${proof.write.signing_address}` : ""),
    );
    res.json({ ok: true, task_id: task.id, slot, result_hash: got, proof_kinds: kinds });
  });

  // Stage 3.5: AI task plan → exact create_task arguments.
  app.post("/plan", async (req, res) => {
    try {
      res.json(await createPlan(req.body));
    } catch (e) {
      if (e instanceof PlanError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  // Stage 3.4: the assembled final report as markdown.
  app.get("/tasks/:id/report", async (req, res) => {
    const task = await loadTask(req, res);
    if (!task) return;
    const fr = store.finalReport(task.id);
    if (!fr?.report) return res.status(404).json({ error: `no final report for task ${task.id} yet` });
    res.type("text/markdown; charset=utf-8").send(fr.report);
  });

  // On-chain task merged with stored off-chain text.
  app.get("/tasks/:id", async (req, res) => {
    const task = await loadTask(req, res);
    if (!task) return;
    const results = store.results(task.id);
    const fr = store.finalReport(task.id);
    const sp = fr?.proof as { kind?: string; chat_id?: string; signing_address?: string; model?: string } | null | undefined;
    res.json({
      ...task,
      final_report: fr
        ? {
            status: fr.status,
            attempts: fr.attempts,
            report_hash: fr.report_hash,
            matches_on_chain: fr.report_hash !== null && fr.report_hash === task.final_report_hash,
            tx: fr.tx,
            url: `/tasks/${task.id}/report`,
            synthesis_proof: sp ? { kind: sp.kind, chat_id: sp.chat_id, signing_address: sp.signing_address, model: sp.model } : null,
            last_error: fr.last_error,
          }
        : null,
      description: store.description(task.id) ?? null,
      slots: task.slots.map((s, i) => ({
        ...s,
        result: results.get(i)?.text ?? null,
        proof: results.get(i)?.proof ?? null,
      })),
    });
  });

  // Errors from the RPC etc. (Express 5 forwards async rejections here).
  app.use((err: unknown, _req: Request, res: Response, _next: unknown) => {
    console.error("[api] error:", err);
    res.status(502).json({ error: "upstream error", detail: String(err) });
  });

  return app;
}
