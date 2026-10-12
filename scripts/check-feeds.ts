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
  /** Avertissements détaillés par règle (ex: PUBLISHER_MISMATCH, WEBSITE_DEAD, etc.) */
  warnings?: Array<{ rule: string; message: string }>;
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

/** Le libellé existe ? sinon on le crée (422/409 = déjà présent, non bloquant). */
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

/** Extrait le JSON structuré de la sortie de validate.ts --json */
function extractValidationJson(output: string): { findings: any[]; results: any[] } | null {
  // La sortie contient des logs sur stderr/stdout mélangés, le JSON est à la fin
  // On cherche le dernier objet JSON complet qui contient 'findings' et 'results'
  let braceCount = 0;
  let jsonStart = -1;

  for (let i = 0; i < output.length; i++) {
    if (output[i] === "{") {
      if (braceCount === 0) jsonStart = i;
      braceCount++;
    } else if (output[i] === "}") {
      braceCount--;
      if (braceCount === 0 && jsonStart !== -1) {
        const jsonStr = output.slice(jsonStart, i + 1);
        try {
          const data = JSON.parse(jsonStr);
          if (data.findings && data.results) {
            return data;
          }
        } catch {
          // Pas un JSON valide complet, on continue
        }
        jsonStart = -1;
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { code, report, reportPath } = runValidation();
  const { errors, warnings } = counts(report);
  console.log(`\n${errors} erreur(s) bloquante(s), ${warnings} avertissement(s) → ${reportPath}`);

  // Cache santé des flux par podcast (pour la page /health/)
  const feedHealthCache: Record<string, FeedHealthEntry> = {};

  // 1) Récupérer les résultats structurés (JSON) de validate.ts
  const { stdout: jsonOutput } = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/validate.ts", "--rss", "--all", "--json"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  if (jsonOutput) {
    const data = extractValidationJson(jsonOutput);
    if (data) {
      const { findings, results } = data;

      // Grouper les findings par slug
      const findingsBySlug = new Map<string, Array<{ rule: string; message: string }>>();
      for (const finding of findings) {
        // Trouver le slug correspondant via le nom de l'entrée (entry)
        // On doit mapper entry name -> slug via les résultats
        const entryName = finding.entry;
        const result = results.find((r) => {
          // Le résultat contient le slug, on a besoin de faire le lien via le nom
          // Pour l'instant on stocke par entry name, on fera la correspondance côté site
          return true;
        });
        // On va stocker les findings indexés par le nom d'entrée pour l'instant
        // et faire la correspondance côté health.astro via getEntries()
        const key = finding.file ? finding.file.replace(/entries\/[^/]+\/(.+)\.json/, "$1") : finding.entry;
        // Mieux: utiliser le slug depuis results si possible
        // Pour l'instant on stocke par entry name
        if (!findingsBySlug.has(finding.entry)) {
          findingsBySlug.set(finding.entry, []);
        }
        findingsBySlug.get(finding.entry)!.push({
          rule: finding.rule,
          message: finding.message,
        });
      }

      // Construire le cache final avec slug comme clé
      for (const result of results) {
        const slug = result.slug;
        const status = result.status === "ok" ? "ok" : result.status === "warn" ? "stale" : "error";

        // Chercher les warnings pour ce slug via le nom d'entrée
        // On a besoin de mapper slug -> entry name
        // Pour l'instant on fait simple : on cherche dans findingsBySlug par entry name
        // Mais on n'a pas le entry name dans results... Il faut le récupérer autrement.
      }

      // Approche plus simple: on fait un map entry name -> slug depuis les entries
      // Mais on n'a pas les entries ici... On va faire la correspondance côté site
      // en chargeant les entries et en matchant par nom.

      // Pour l'instant, on stocke les findings bruts indexés par entry name
      // et on fait le mapping côté client
      const rawFindingsByEntryName = new Map<string, Array<{ rule: string; message: string }>>();
      for (const finding of findings) {
        if (!rawFindingsByEntryName.has(finding.entry)) {
          rawFindingsByEntryName.set(finding.entry, []);
        }
        rawFindingsByEntryName.get(finding.entry)!.push({
          rule: finding.rule,
          message: finding.message,
        });
      }

      // Stocker les findings bruts dans le cache pour usage côté site
      const cacheData = {
        timestamp: new Date().toISOString(),
        bySlug: {} as Record<string, FeedHealthEntry>,
        byEntryName: Object.fromEntries(rawFindingsByEntryName),
        summary: { errors, warnings, total: results.length },
      };

      // Ajouter le status de base par slug
      for (const result of results) {
        const status = result.status === "ok" ? "ok" : result.status === "warn" ? "stale" : "error";
        cacheData.bySlug[result.slug] = {
          status,
          lastChecked: new Date().toISOString(),
          error: status !== "ok" ? `Status: ${result.status}` : undefined,
        };
      }

      try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
        console.log(`💾 Cache santé des flux écrit → ${path.relative(ROOT, CACHE_FILE)}`);
      } catch (err) {
        console.warn(`⚠️  Impossible d'écrire le cache : ${err}`);
      }
    }
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