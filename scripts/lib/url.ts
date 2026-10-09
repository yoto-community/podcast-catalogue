/**
 * Contrôle de sécurité des URL saisies par les contributeurs (anti-SSRF).
 * Règle : https uniquement, hôte public, aucune IP privée/loopback ni identifiant dans l'URL.
 */

/** Renvoie le problème détecté, ou `undefined` si l'URL est acceptable. */
export function urlProblem(raw: string, opts: { allowHttp?: boolean } = {}): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "URL invalide";
  }
  if (url.protocol !== "https:" && !(opts.allowHttp && url.protocol === "http:")) {
    return `protocole « ${url.protocol} » refusé (https uniquement)`;
  }
  if (url.username || url.password) return "identifiants dans l’URL refusés";
  const host = url.hostname.toLowerCase();
  if (!host) return "hôte vide";
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return `hôte « ${host} » refusé`;
  }
  const ip = parseIp(host);
  if (ip && isPrivateIp(ip)) return `IP privée/loopback refusée (${host})`;
  return undefined;
}

function parseIp(host: string): string | undefined {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  if (host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1);
  return undefined;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  const [a = 0, b = 0, c = 0] = ip.split(".").map(Number) as [number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0)
  );
}
