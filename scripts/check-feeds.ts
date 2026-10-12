/**
 * Santé des flux (hebdomadaire) : relance la validation niveau 3 sur **tout** le dépôt,
 * puis maintient l'unique issue `feed-health` du dépôt.
 *
 *   erreur bloquante → ouverture de l'issue si absente, mise à jour de son corps sinon
 *   retour au vert   → fermeture de l'issue avec un commentaire
 *
 * Une seule issue ouverte à la fois : pas de spam hebdomadaire. Les avertissements
 * (flux périmés, éditeur divergent…) sont affichés mais ne bloquent pas.
 *
 * Génère aussi un cache JSON `.cache/feed-health.json` pour la page `/health/` du site.
 *
 * Usage : pnpm check-feeds
 * CI     : .github/workflows/feed-health.yml (cron + workflow_dispatch)
 *          GitHub n'est touché que si GITHUB_TOKEN + GITHUB_REPOSITORY sont fournis ;
 *          en local, seul le rapport Markdown est écrit.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, REPOSITORY } from "./lib/config.ts";

const CACHE_FILE = path.join(ROOT, ".cache", "feed-health.json");

interface FeedHealthEntry {
  status: "ok" | "stale" | "error";
  lastChecked: string;
  error?: string;
}

const LABEL = "feed-health";
const API = "https://api.github.com";

interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  pull_request?: unknown;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "yoto-podcast-catalog-check-feeds",
    "x-github-api-version": "2022-11-28",
  };
}

async function gh(
  token: string,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<Response> {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { ...authHeaders(token), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok && res.status !== 422 && res.status !== 409) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`${method} ${endpoint} → HTTP ${res.status} : ${detail}`);
  }
  return res;
}

/** La libellé existe ? sinon on le crée (422/409 = déjà présent, non bloquant). */
async function ensureLabel(token: string): Promise<void> {
  const res = await gh(token, "POST", `/repos/${REPOSITORY}/labels`, {
    name: LABEL,
    color: "fbca04",
    description: "Santé des flux RSS du catalogue (contrôle hebdomadaire)",
  });
  if (res.status === 201) console.log(`🏷  libellé « ${LABEL} » créé`);
}

async function openIssues(token: string): Promise<GhIssue[]> {
  const res = await gh(
    token,
    "GET",
    `/repos/${REPOSITORY}/issues?state=open&labels=${LABEL}&per_page=50`,
  );
  const data = (await res.json()) as GhIssue[];
  return data.filter((issue) => !issue.pull_request);
}

/** Exécute le niveau 3 complet et renvoie le code retour + le rapport Markdown. */
function runValidation(): { code: number; report: string; reportPath: string } {
  const dir = process.env.RUNNER_TEMP ?? os.tmpdir();
  const reportPath = path.join(dir, "yoto-podcast-catalog-feed-health.md");
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/validate.ts", "--rss", "--all", "--report", reportPath],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  const code = result.status ?? 1;
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
  return { code, report, reportPath };
}

function counts(report: string): { errors: number; warnings: number } {
  const match = report.match(/(\d+) erreur\(s\) globale\(s\) · (\d+) avertissement\(s\)/);
  return { errors: Number(match?.[1] ?? 0), warnings: Number(match?.[2] ?? 0) };
}

function issueBody(report: string, runUrl: string): string {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  return [
    "<!-- généré par scripts/check-feeds.ts — ne pas éditer -->",
    `Contrôle hebdomadaire des flux du catalogue · dernière exécution : ${stamp} UTC${runUrl ? `\n\n[Voir l'exécution](${runUrl})` : ""}`,
    "",
    report.trim(),
    "",
    "Chaque entrée doit rester écoutable : un flux **bloquant** ici signifie une entrée à réparer",
    "(URL changée) ou à retirer de `entries/` — voir `CONTRIBUTING.md`.",
  ].join("\n");
}

async function main(): Promise<void> {
  const { code, report, reportPath } = runValidation();
  const { errors, warnings } = counts(report);
  console.log(`\n${errors} erreur(s) bloquante(s), ${warnings} avertissement(s) → ${reportPath}`);

  // Parse feed health per podcast for cache
  const feedHealthCache: Record<string, FeedHealthEntry> = {};
  try {
    const validateOutput = report;
    // Extract per-feed status from report lines
    const lines = validateOutput.split("\n");
    for (const line of lines) {
      // Match lines like: ❌ [FEED_UNREACHABLE] entries/fr/tout-petits.json → « Name » — message
      // or: ⚠️ [FEED_STALE] entries/fr/tout-petits.json → « Name » — message
      const match = line.match(
        /^[❌⚠️] \[([A-Z_]+)\] (entries\/[^/]+\/[^.]+\.json) → « ([^»]+) » — (.+)$/,
      );
      if (match) {
        const [, rule, file, name, message] = match;
        // Extract slug from file path: entries/fr/tout-petits.json -> slug from the entry
        // We'll need to load entries to get slug, but for now let's use a simpler approach
      }
    }
  } catch {
    // Ignore cache generation errors
  }

  // Better approach: run validate with --json to get structured results
  const { stdout: jsonOutput } = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/validate.ts", "--rss", "--all", "--json"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  if (jsonOutput) {
    try {
      // JSON is in stdout after all warning messages, followed by a summary line
      // Find the last complete JSON object (from first { to matching })
      const lines = jsonOutput.split("\n");
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (let j = 0; j < line.length; j++) {
          if (line[j] === "{") {
            if (braceCount === 0) jsonStart = i;
            braceCount++;
          } else if (line[j] === "}") {
            braceCount--;
            if (braceCount === 0 && jsonStart !== -1) {
              jsonEnd = i;
            }
          }
        }
      }

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonLines = lines.slice(jsonStart, jsonEnd + 1);
        const jsonStr = jsonLines.join("\n");
        const data = JSON.parse(jsonStr);
        const results = data.results || [];
        for (const result of results) {
          const status =
            result.status === "ok" ? "ok" : result.status === "warn" ? "stale" : "error";
          feedHealthCache[result.slug] = {
            status,
            lastChecked: new Date().toISOString(),
            error: status !== "ok" ? `Status: ${result.status}` : undefined,
          };
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Write cache file
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(feedHealthCache, null, 2));
    console.log(`💾 Cache santé des flux écrit → ${path.relative(ROOT, CACHE_FILE)}`);
  } catch (err) {
    console.warn(`⚠️  Impossible d'écrire le cache : ${err}`);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token || !process.env.GITHUB_REPOSITORY) {
    console.log("ℹ️  GITHUB_TOKEN / GITHUB_REPOSITORY absents : GitHub non touché (mode local).");
    process.exit(code);
  }

  await ensureLabel(token);
  const open = await openIssues(token);
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : "";

  if (errors > 0) {
    const title = `🩺 Santé des flux — ${errors} erreur(s), ${warnings} avertissement(s)`;
    const body = issueBody(report, runUrl);
    const [primary, ...extra] = open;
    if (!primary) {
      await gh(token, "POST", `/repos/${REPOSITORY}/issues`, { title, body, labels: [LABEL] });
      console.log(`✅ issue « ${LABEL} » ouverte — ${title}`);
    } else {
      if (primary.title !== title || primary.body !== body) {
        await gh(token, "PATCH", `/repos/${REPOSITORY}/issues/${primary.number}`, { title, body });
        console.log(`🔄 issue #${primary.number} mise à jour`);
      }
      // Une seule issue à la fois : les suivantes sont fermées.
      for (const duplicate of extra) {
        await gh(token, "PATCH", `/repos/${REPOSITORY}/issues/${duplicate.number}`, {
          state: "closed",
        });
        console.log(`issue doublon #${duplicate.number} fermée`);
      }
    }
  } else {
    for (const issue of open) {
      await gh(token, "POST", `/repos/${REPOSITORY}/issues/${issue.number}/comments`, {
        body: `✅ Tous les flux répondent de nouveau (${warnings} avertissement(s) restants — non bloquants).`,
      });
      await gh(token, "PATCH", `/repos/${REPOSITORY}/issues/${issue.number}`, { state: "closed" });
      console.log(`✅ issue #${issue.number} fermée`);
    }
  }

  process.exit(code);
}

main().catch((err: unknown) => {
  console.error("❌ check-feeds échoué :", err instanceof Error ? err.stack : err);
  process.exit(1);
});
