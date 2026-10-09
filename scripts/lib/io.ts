import fs from "node:fs";
import path from "node:path";

/** Écrit un JSON au format imposé : 2 espaces, LF, fin de fichier. */
export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function readJsonIfExists<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  return readJson<T>(file);
}

/** Fichiers JSON d'un répertoire, triés, chemins relatifs à `base`. */
export function listJsonFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const dirent of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) out.push(...listJsonFiles(full, base));
    else if (dirent.isFile() && dirent.name.endsWith(".json")) out.push(path.relative(base, full));
  }
  return out.sort();
}
