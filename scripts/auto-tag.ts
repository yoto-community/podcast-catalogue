/**
 * Auto-taggage des entrées existantes basé sur nom + description + catégorie.
 * Usage : pnpm tsx scripts/auto-tag.ts [--dry-run] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/config.ts";
import { loadTags } from "./lib/catalog.ts";
import { slugify, normalizeName } from "./lib/norm.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const WRITE = process.argv.includes("--write") && !DRY_RUN;

const tags = loadTags();
const tagIds = new Set(tags.map((t) => t.id));

// Mots-clés par tag (français + anglais)
const TAG_KEYWORDS: Record<string, string[]> = {
  animaux: ["animal", "animaux", "bestioles", "bêtes", "faune", "chien", "chat", "loup", "oiseau", "insecte", "poisson", "mer", "océan", "sauvage", "zoo", "vétérinaire"],
  dinosaures: ["dinosaure", "dinosaures", "préhistorique", "jurassique", "fossile", "paléontologue"],
  espace: ["espace", "astronomie", "univers", "galaxie", "étoile", "planète", "lune", "astronaute", "astro", "navette", "voiture lactée", "trou noir", "système solaire"],
  sciences: ["science", "scientifique", "expérience", "expériences", "laboratoire", "découverte", "invention", "cerveau", "génie", "physique", "chimie", "biologie", "vulgarisation", "curieux de sciences"],
  "histoires-soir": ["soir", "dodo", "endormir", "coucher", "rêve", "songes", "nuit", "dormir", "berceuse", "histoire du soir", "bonne nuit"],
  "contes-classiques": ["conte", "contes", "grimm", "perrault", "andersen", "légende", "légendes", "mythe", "mythologie", "mythes", "classique", "folk", "folk-tales", "conte classique"],
  "histoires-originales": ["histoire originale", "fiction originale", "improvisé", "improvisation", "création sonore", "inédit", "originale"],
  "enquetes-mysteres": ["enquête", "enquêtes", "mystère", "mystères", "détective", "espion", "énigme", "énigmes", "police", "suspect", "indice", "secret", "disparition"],
  "personnages-recurrents": ["tintin", "arsène lupin", "arsene lupin", "pomme d'api", "pomme d api", "passe-partout", "passe partout", "petit nicolas", "petit nicolas", "octave et mélo", "octave et melo"],
  musique: ["musique", "comptine", "comptines", "chanson", "chansons", "chant", "opéra", "orchestre", "instrument", "mélodie", "musicien", "compositeur", "partition", "rythme"],
  "histoire-france": ["histoire de france", "roi", "reine", "révolution", "napoléon", "château", "versailles", "louis", "marie-antoinette", "france", "patrimoine", "moyen âge", "moyen-age"],
  "geographie-voyages": ["voyage", "voyages", "tour du monde", "pays", "ville", "paris", "londres", "afrique", "japon", "monde", "découverte culturelle", "capital", "continent", "carte"],
  "emotions-bienetre": ["émotion", "émotions", "sentiment", "sentiments", "bien-être", "bonheur", "peur", "colère", "confiance", "psycho", "psychologie", "gérer", "apaiser", "tristesse", "joie", "anxiété"],
  apprentissages: ["apprendre", "école", "leçon", "quiz", "question", "réponse", "curieux", "découvrir", "savoir", "connaissance", "pédagogie", "éducatif", "instruction", "cours"],
  "nature-environnement": ["nature", "environnement", "écologie", "écologique", "plante", "plantes", "arbre", "forêt", "rivière", "montagne", "sauvage", "biodiversité", "climat", "planète", "terre"],
  philosophie: ["philosophie", "philo", "sens", "existence", "réfléchir", "débat", "questionner", "pourquoi", "grand question", "pensée", "raisonnement", "argument"],
  "arts-culture": ["art", "peinture", "musée", "culture", "créativité", "dessin", "théâtre", "spectacle", "artiste", "tableau", "sculpture", "exposition", "galerie", "patrimoine", "architecture"],
  langues: ["anglais", "bilingue", "langue", "langues", "apprendre l'anglais", "english", "foreign language", "vocabulaire", "traduction"],
  "heros-filles": ["fille", "héroïne", "femme", "girl", "power", "puissance", "féminin", "féminisme", "filles", "heroine", "power girls", "modèle féminin"],
  humour: ["drôle", "rigolo", "blague", "rire", "humour", "comique", "amusant", "bêtise", "bêtises", "farce", "rire", "comique", "sketch", "impro", "improvisation"],
  "sante-corps": ["corps", "santé", "dent", "brossage", "hygiène", "médecin", "hôpital", "handicap", "inclusion", "soin", "maladie", "vitamine", "sport", "exercice", "alimentation"],
  technologie: ["invention", "technologie", "robot", "ordinateur", "code", "programmation", "innovation", "numérique", "algorithm", "ia", "intelligence artificielle", "machine"],
  "politique-societe": ["politique", "président", "démocratie", "citoyenneté", "société", "droits", "vote", "élection", "gouvernement", "loi", "justice", "parlement"],
  "cuisine-alimentation": ["cuisine", "alimentation", "manger", "nourriture", "assiette", "recette", "chef", "restaurant", "goût", "saveur", "gastronomie", "culinaire", "repas"],
};

function matchTags(text: string): string[] {
  const normalized = normalizeName(text);
  const matched: string[] = [];
  for (const [tagId, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => normalized.includes(normalizeName(kw)))) {
      matched.push(tagId);
    }
  }
  return [...new Set(matched)];
}

function autoTagEntries(): void {
  const files = fs.readdirSync(paths.entries, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((langDir) =>
      fs.readdirSync(path.join(paths.entries, langDir.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith(".json"))
        .map((f) => ({ lang: langDir.name, file: f.name, path: path.join(paths.entries, langDir.name, f.name) }))
    );

  let totalChanged = 0;
  let totalEntries = 0;

  for (const { lang, file, path: filePath } of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    let entries;
    try {
      entries = JSON.parse(raw);
    } catch (e) {
      console.error(`❌ ${lang}/${file} : JSON invalide`);
      continue;
    }

    let fileChanged = false;
    for (const entry of entries) {
      totalEntries++;
      const text = `${entry.name} ${entry.description ?? ""} ${entry.category}`;
      const matched = matchTags(text);

      // Fallback: si aucun tag, utiliser la catégorie comme tag (si elle a un équivalent)
      const finalTags = matched.length > 0 ? matched : (TAG_KEYWORDS[entry.category] ? [entry.category] : []);

      // Filtrer les tags valides
      const validTags = finalTags.filter((t) => tagIds.has(t));

      if (JSON.stringify(entry.tags ?? []) !== JSON.stringify(validTags)) {
        entry.tags = validTags;
        fileChanged = true;
        totalChanged++;
      }
    }

    if (fileChanged) {
      // Trier par slug
      entries.sort((a: any, b: any) => slugify(a.name).localeCompare(slugify(b.name)));

      const output = JSON.stringify(entries, null, 2) + "\n";
      if (WRITE) {
        fs.writeFileSync(filePath, output, "utf8");
        console.log(`✏️  ${lang}/${file} : ${entries.length} entrées, tags mis à jour`);
      } else if (DRY_RUN) {
        console.log(`🔍 ${lang}/${file} : ${entries.length} entrées, ${entries.filter((e: any) => e.tags?.length).length} auraient des tags`);
      }
    }
  }

  if (WRITE) {
    console.log(`\n✅ ${totalChanged}/${totalEntries} entrées taggées dans ${files.length} fichiers`);
  } else if (DRY_RUN) {
    console.log(`\n🔍 Dry-run : ${totalEntries} entrées analysées`);
  }
}

autoTagEntries();