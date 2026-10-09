import { execSync } from "node:child_process";

export interface GitInfo {
  commit: string;
  /** `YYYY.MM.DD` (date du commit → un rebuild du même commit = même version). */
  date: string;
  /** Nombre de commits → suffixe monotone dans la journée. */
  count: number;
}

function git(cmd: string): string | undefined {
  try {
    return execSync(`git ${cmd}`, { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function gitInfo(): GitInfo {
  const commit = git("rev-parse --short HEAD") ?? "nogit";
  const date =
    git("log -1 --format=%cd --date=format:%Y.%m.%d") ??
    new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  const count = Number(git("rev-list --count HEAD") ?? "1");
  return { commit, date, count: Number.isFinite(count) && count > 0 ? count : 1 };
}

/** `2026.10.09-3` — monotone, dédié au cache. */
export function catalogVersion(info = gitInfo()): string {
  return `${info.date}-${info.count}`;
}
