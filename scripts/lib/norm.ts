/** Slug stable : `Animalité` → `animalite`. Source de l'identifiant unique en dist. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalisation d'URL pour la détection de doublons (règle D1). */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim().toLowerCase();
  }
  url.hash = "";
  const params = [...url.searchParams.keys()].filter(
    (k) => !/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$)/i.test(k),
  );
  for (const key of [...url.searchParams.keys()]) {
    if (!params.includes(key)) url.searchParams.delete(key);
  }
  const defaultPort =
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80");
  if (defaultPort) url.port = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  let out = url.toString();
  if (url.pathname === "/" && !url.search) out = out.replace(/\/$/, "");
  return out;
}

/** Normalisation de titre pour la détection de doublons (règle D2). */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
