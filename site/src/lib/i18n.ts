/**
 * Traductions de l'interface du site (FR/EN).
 *
 * Source unique de vérité : toute chaîne affichée par le site doit vivre ici.
 * Le dictionnaire anglais est typé sur les clés du français — une clé manquante
 * casse `pnpm typecheck`.
 */

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "fr" || value === "en";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "fr" ? "en" : "fr";
}

/** Segments d'URL localisés (hors tranches et fiches, déjà neutres). */
export const routeSegments = {
  fr: {
    search: "recherche",
    themes: "themes",
    authors: "auteurs",
    publishers: "editeurs",
    newReleases: "nouveautes",
    favorites: "favoris",
  },
  en: {
    search: "search",
    themes: "themes",
    authors: "authors",
    publishers: "publishers",
    newReleases: "new-releases",
    favorites: "favorites",
  },
} as const;

export type SectionKey = keyof (typeof routeSegments)["fr"];

const fr = {
  /* ------------------------------------------------------------- layout */
  siteName: "Annuaire de podcasts",
  metaSiteName: "Annuaire de podcasts pour enfants",
  skipToContent: "Aller au contenu principal",
  navMain: "Navigation principale",
  navCatalogue: "Catalogue",
  navPublishers: "Éditeurs",
  navAuthors: "Auteurs",
  navFavorites: "Favoris",
  navThemes: "Thèmes",
  navCommunity: "Communauté",
  navApi: "API",
  navHealth: "Santé flux",
  navContribute: "Contribuer",
  navAwesomeYoto: "Awesome Yoto",
  navIconsCatalogue: "Catalogue d’icônes",
  navGithub: "GitHub",
  newTab: "(nouvel onglet)",
  languageSwitchLabel: "Langue",
  localeNameFr: "Français",
  localeNameEn: "English",

  footerCommunityBefore: "Fait partie de la",
  footerCommunityLink: "communauté Yoto",
  footerCommunityAfter: "—",
  footerMyoLink: "créez votre première carte MYO",
  footerUpdatedBefore: "Catalogue mis à jour le",
  footerVersion: "version",
  footerMeta: "{count} podcasts · données publiques, libres de réutilisation.",
  pwaNewVersion: "Une nouvelle version de l'application est disponible.",
  pwaRefresh: "Rafraîchir maintenant",
  pwaLater: "Plus tard",
  pwaDismiss: "Ignorer",

  /* ------------------------------------------------------------- lecteur */
  playerPlay: "Lecture",
  playerPause: "Pause",
  playerToggleSr: "Lecture ou pause",
  playerPosition: "Position dans l’épisode",
  playerTime: "Temps de lecture :",
  playerListenExternal: "Écouter sur le site de l’éditeur",
  playerDownload: "Télécharger",
  playerClose: "Fermer le lecteur",
  playerErrorTitle: "Écoute indisponible ici.",
  playerErrorText: "Utilisez le lien vers le site de l’éditeur ou téléchargez l’épisode.",
  playerRetry: "Réessayer",
  playerDownloadAria: "Télécharger « {title} »",
  playerExternalAria: "Écouter « {title} » sur le site de l’éditeur",
  defaultEpisode: "Épisode",
  defaultPodcast: "Podcast",
  copied: "Copié !",
  copyFailed: "Copie impossible",

  /* ------------------------------------------------------------- accueil */
  homeTitle: "Catalogue de podcasts pour enfants",
  homeDescription:
    "{count} podcasts pour enfants — classés par langue, tranche d'âge et thème. Flux RSS vérifiés, prêts pour cartes MYO Yoto.",
  homeIntro:
    "Flux RSS validés, classés par âge et thème — prêts à ajouter sur une carte MYO Yoto ou tout lecteur.",
  randomPodcast: "Podcast au hasard",
  randomPodcastAria: "Découvrir un podcast au hasard",
  languageNavLabel: "Langues",

  /* ------------------------------------------------------------- tranches */
  groupAllGroups: "Toutes les tranches",
  groupTitle: "{label} ({ageRange}) — podcasts",
  groupDescription:
    "{count} podcasts pour la tranche {label} ({ageRange}), avec écoute directe et lien vers le site de l'éditeur.",
  groupIntro: "{count} podcasts pour la tranche « {label} » — {ageRange}{agesPart}.{shared}",
  groupAgesPart: ", soit les âges {ages}",
  groupShared: " Un enfant de {age} ans trouvera aussi des podcasts en « {other} ».",
  groupJsonLdName: "{label} — podcasts",

  /* ------------------------------------------------------------- catalogue */
  catalogFilters: "Filtres",
  catalogSearchLabel: "Rechercher un podcast",
  catalogSearchPlaceholder: "Nom, éditeur, description, catégorie…",
  catalogSearchHelpBefore: "Raccourci : touche",
  catalogSearchHelpAfter: "pour placer le curseur ici.",
  catalogAuthor: "Auteur / animateur",
  catalogAllAuthors: "Tous les auteurs",
  catalogLanguage: "Langue",
  catalogAllLanguages: "Toutes les langues",
  catalogAge: "Âge de l'enfant",
  catalogAgeHelp:
    "Un ou plusieurs âges : la liste affiche les podcasts adaptés à au moins l'un d'eux. Les âges de frontière (5 et 7 ans) relèvent de deux tranches.",
  catalogCategory: "Catégorie",
  catalogAllCategories: "Toutes les catégories",
  catalogSort: "Trier par",
  catalogSortName: "Nom",
  catalogSortCategory: "Catégorie",
  catalogReset: "Réinitialiser les filtres",
  catalogEmpty: "Aucun podcast ne correspond à ces filtres.",
  catalogAgeAria: "{longLabel} — {count}",
  podcastSingular: "podcast",
  podcastPlural: "podcasts",
  episodeSingular: "épisode",
  episodePlural: "épisodes",

  /* ------------------------------------------------------------- âges */
  ageYears: "{age} ans",
  ageYearsPlus: "{age} ans et plus",
  ageShortOpen: "{age}+",
  listAnd: "et",

  /* ------------------------------------------------------------- cartes */
  coverAlt: "Pochette du podcast « {name} »",
  cardFeatures: "Caractéristiques de {name}",
  cardAgesCovered: "Âges couverts : {ages}",
  cardAgesSr: "— âges {ages}",
  unknownAuthor: "Inconnu",

  /* ------------------------------------------------------------- fiche */
  breadcrumb: "Fil d'ariane",
  detailFeatures: "Caractéristiques du podcast",
  detailEpisodeCount: "{count} épisode(s)",
  detailListenExternal: "Écouter sur le site de l'éditeur",
  detailRss: "Flux RSS",
  detailCopyRss: "Copier le flux",
  detailCopyRssAria: "Copier l'URL du flux RSS",
  detailDescription: "Description",
  detailEpisodes: "Épisodes",
  detailDescriptionFallback: "{name} — podcast en {language}, éditeur {publisher}.",
  favorite: "Favori",
  unfavorite: "Retirer",
  favoriteAddAria: "Ajouter aux favoris",
  favoriteRemoveAria: "Retirer des favoris",

  /* ------------------------------------------------------------- épisodes */
  episodesUpdated: "Épisodes mis à jour le",
  episodesIndexed: "{count} épisode(s) indexé(s) ({total} au total dans le flux)",
  episodesIndexedSuffix: "({total} au total dans le flux)",
  episodeNumber: "Épisode n° {number}",
  episodeUnavailable: "Écoute indisponible ici — utilisez le lien externe.",
  episodeListen: "Écouter",
  episodeListenSr: "l’épisode",
  episodeListenAria: "Écouter « {title} »",
  episodeDownload: "Télécharger",
  episodeDownloadAria: "Télécharger « {title} »",
  episodesEmptyTitle: "Épisodes en cours d’indexation…",
  episodesEmptyText:
    "La liste des épisodes de ce podcast n'est pas encore publiée dans le catalogue. Elle apparaîtra automatiquement au prochain indexage des flux.",
  episodesListenExternal: "Écouter sur le site de l'éditeur",
  episodesViewRss: "Voir le flux RSS",
  durationAria: "Durée : {duration}",

  /* ------------------------------------------------------------- recherche */
  searchTitle: "Recherche dans les épisodes",
  searchDescription:
    "Recherche full-text dans tous les épisodes du catalogue — résultats instantanés, lecture directe.",
  searchHeading: "Rechercher dans les épisodes",
  searchIntroBefore: "Tapez un mot-clé (ex.",
  searchIntroMiddle: "…) — la recherche porte sur les titres et descriptions de",
  searchIntroAfter: "épisodes.",
  searchExample1: "dinosaures",
  searchExample2: "histoire du soir",
  searchExample3: "espace",
  searchFormLabel: "Recherche d'épisodes",
  searchQueryLabel: "Rechercher un épisode",
  searchPlaceholder: "Titre, description, podcast… (ex. « dinosaures »)",
  searchHintBefore: "Raccourci : touche",
  searchHintMiddle: "pour focus ·",
  searchHintEscape: "Échap",
  searchHintAfter: "pour effacer · Résultats mis à jour en temps réel",
  searchFilters: "Filtres",
  searchFilterLanguage: "Filtrer par langue",
  searchFilterCategory: "Filtrer par catégorie",
  searchFilterAge: "Filtrer par tranche d'âge",
  searchAge: "Tranche d'âge",
  searchAllAges: "Tous les âges",
  searchEmpty: "Aucun épisode ne correspond à votre recherche.",
  searchLoading: "Chargement de l'index…",
  searchError: "Impossible de charger l'index de recherche.",
  searchFeatures: "Caractéristiques",
  searchListenAria: "Écouter cet épisode",
  searchViewPodcast: "Voir le podcast",
  searchIndexLoaded: "Index de recherche chargé : {count} épisodes",
  searchIndexError: "Erreur chargement index :",

  /* ------------------------------------------------------------- favoris */
  favoritesTitle: "Mes favoris",
  favoritesDescription:
    "Podcasts marqués comme favoris — stockés localement dans votre navigateur, synchronisés entre onglets.",
  favoritesHeading: "Mes favoris",
  favoritesIntro:
    "Vos podcasts préférés, sauvegardés localement. Cliquez sur le cœur sur n'importe quelle fiche pour ajouter/retirer.",
  favoritesEmptyTitle: "Aucun favori pour l'instant",
  favoritesEmptyBefore: "Parcourez le",
  favoritesEmptyCatalogue: "catalogue",
  favoritesEmptyAfter: "et cliquez sur le cœur sur une fiche pour l'ajouter ici.",
  favoritesJsonLdName: "Mes favoris",
  favoritesJsonLdDescription: "Vos podcasts favoris — sauvegardés localement dans votre navigateur",

  /* ------------------------------------------------------------- nouveautés */
  newReleasesTitle: "Nouveautés",
  newReleasesDescription:
    "Les {count} épisodes les plus récents du catalogue — toutes langues et tranches confondues.",
  newReleasesHeading: "Nouveautés",
  newReleasesIntro:
    "Les épisodes les plus récemment publiés, toutes langues et tranches d'âge confondues.",
  newReleasesCount: "{count} épisodes récents",
  newReleasesEmpty: "Aucun épisode indexé pour le moment.",
  newReleasesViewPodcast: "Voir le podcast",
  newReleasesCoverAlt: "Pochette de {name}",
  newReleasesJsonLdName: "Nouveaux épisodes — Catalogue de podcasts",

  /* ------------------------------------------------------------- thèmes */
  themesTitle: "Thèmes",
  themesDescription:
    "{count} thèmes pour découvrir les podcasts par sujet — animaux, espace, histoire, sciences, musique et plus.",
  themesHeading: "Thèmes",
  themesIntro:
    "Parcourez les podcasts par thème — chaque thème regroupe des podcasts partageant un même sujet.",
  themesCount: "{count} thèmes",
  themesJsonLdName: "Thèmes",
  themesJsonLdDescription: "Tous les thèmes du catalogue de podcasts pour enfants",
  themeAllThemes: "Tous les thèmes",
  themeTagged: "{count} podcasts taggués « {label} ».",
  themeDescription:
    "{count} podcasts sur le thème « {label} » — écoute directe, description et lien vers le site de l'éditeur.",
  themeJsonLdName: "Podcasts — {label}",

  /* ------------------------------------------------------------- auteurs */
  authorsTitle: "Auteurs — Catalogue de podcasts",
  authorsHeading: "Auteurs / animateurs",
  authorsDescription: "{count} auteurs / animateurs — {podcasts} classés par créateur.",
  authorsIntro: "Découvrez les podcasts par auteur, animateur ou créateur principal.",
  authorsCount: "{count} auteurs · {podcasts}",
  authorsAll: "Tous les auteurs",
  authorsJsonLdName: "Auteurs",
  authorsJsonLdDescription: "Tous les auteurs / animateurs du catalogue de podcasts pour enfants",
  authorJsonLdName: "Podcasts — {name}",
  authorDescription:
    "{count} podcasts de l'auteur / animateur « {name} » — écoute directe, description et lien vers le site.",
  authorIntro: "{count} podcasts créés / animés par « {name} ».",

  /* ------------------------------------------------------------- éditeurs */
  publishersTitle: "Éditeurs — Catalogue de podcasts",
  publishersHeading: "Éditeurs",
  publishersDescription: "{count} éditeurs — {podcasts} classés par maison d'édition.",
  publishersIntro: "Découvrez les podcasts par maison d'édition / producteur.",
  publishersCount: "{count} éditeurs · {podcasts}",
  publishersAll: "Tous les éditeurs",
  publishersJsonLdName: "Éditeurs",
  publishersJsonLdDescription: "Tous les éditeurs du catalogue de podcasts pour enfants",
  publisherJsonLdName: "Podcasts — {name}",
  publisherDescription:
    "{count} podcasts de l'éditeur « {name} » — écoute directe, description et lien vers le site de l'éditeur.",
  publisherIntro: "{count} podcasts publiés par « {name} ».",
  publisherAuthorsHeading: "Auteurs de cet éditeur",

  /* ------------------------------------------------------------- langues */
  languagePodcastsTitle: "Podcasts en {language}",
  languagePodcastsDescription:
    "{count} podcasts en {language}, toutes tranches d'âge : écoute directe, description et lien vers le site de l'éditeur.",
  languagePodcastsIntro:
    "Feuilleter tous les podcasts en {language}. Utilisez la recherche et les filtres pour affiner la liste.",

  /* ------------------------------------------------------------- redirections */
  redirectPageTitle: "Page déplacée",
  redirectPageText: "Cette page a déménagé :",
  redirectContinue: "continuer vers {target}",
} as const;

export type MessageKey = keyof typeof fr;

const en: Record<MessageKey, string> = {
  /* ------------------------------------------------------------- layout */
  siteName: "Podcast Directory",
  metaSiteName: "Kids' podcast directory",
  skipToContent: "Skip to main content",
  navMain: "Main navigation",
  navCatalogue: "Catalogue",
  navPublishers: "Publishers",
  navAuthors: "Authors",
  navFavorites: "Favorites",
  navThemes: "Themes",
  navCommunity: "Community",
  navApi: "API",
  navHealth: "Feed health",
  navContribute: "Contribute",
  navAwesomeYoto: "Awesome Yoto",
  navIconsCatalogue: "Icons catalogue",
  navGithub: "GitHub",
  newTab: "(new tab)",
  languageSwitchLabel: "Language",
  localeNameFr: "Français",
  localeNameEn: "English",

  footerCommunityBefore: "Part of the",
  footerCommunityLink: "Yoto Community",
  footerCommunityAfter: "—",
  footerMyoLink: "build your first MYO card",
  footerUpdatedBefore: "Catalogue updated on",
  footerVersion: "version",
  footerMeta: "{count} podcasts · public data, free to reuse.",
  pwaNewVersion: "A new version of the app is available.",
  pwaRefresh: "Refresh now",
  pwaLater: "Later",
  pwaDismiss: "Dismiss",

  /* ------------------------------------------------------------- lecteur */
  playerPlay: "Play",
  playerPause: "Pause",
  playerToggleSr: "Play or pause",
  playerPosition: "Episode position",
  playerTime: "Playback time:",
  playerListenExternal: "Listen on the publisher's site",
  playerDownload: "Download",
  playerClose: "Close the player",
  playerErrorTitle: "Playback unavailable here.",
  playerErrorText: "Use the link to the publisher's site or download the episode.",
  playerRetry: "Retry",
  playerDownloadAria: "Download “{title}”",
  playerExternalAria: "Listen to “{title}” on the publisher's site",
  defaultEpisode: "Episode",
  defaultPodcast: "Podcast",
  copied: "Copied!",
  copyFailed: "Copy failed",

  /* ------------------------------------------------------------- accueil */
  homeTitle: "Podcast directory for kids",
  homeDescription:
    "{count} podcasts for kids — organised by language, age range and theme. Verified RSS feeds, ready for Yoto MYO cards.",
  homeIntro:
    "Verified RSS feeds, organised by age and theme — ready to add to a Yoto MYO card or any player.",
  randomPodcast: "Random podcast",
  randomPodcastAria: "Discover a random podcast",
  languageNavLabel: "Languages",

  /* ------------------------------------------------------------- tranches */
  groupAllGroups: "All age ranges",
  groupTitle: "{label} ({ageRange}) — podcasts",
  groupDescription:
    "{count} podcasts for the {label} age range ({ageRange}), with direct listening and a link to the publisher's site.",
  groupIntro: "{count} podcasts for the “{label}” age range — {ageRange}{agesPart}.{shared}",
  groupAgesPart: ", i.e. ages {ages}",
  groupShared: " A {age}-year-old will also find podcasts in “{other}”.",
  groupJsonLdName: "{label} — podcasts",

  /* ------------------------------------------------------------- catalogue */
  catalogFilters: "Filters",
  catalogSearchLabel: "Search for a podcast",
  catalogSearchPlaceholder: "Name, publisher, description, category…",
  catalogSearchHelpBefore: "Shortcut: press",
  catalogSearchHelpAfter: "to focus this field.",
  catalogAuthor: "Author / host",
  catalogAllAuthors: "All authors",
  catalogLanguage: "Language",
  catalogAllLanguages: "All languages",
  catalogAge: "Child's age",
  catalogAgeHelp:
    "One or more ages: the list shows podcasts suitable for at least one of them. Boundary ages (5 and 7) belong to two ranges.",
  catalogCategory: "Category",
  catalogAllCategories: "All categories",
  catalogSort: "Sort by",
  catalogSortName: "Name",
  catalogSortCategory: "Category",
  catalogReset: "Reset filters",
  catalogEmpty: "No podcast matches these filters.",
  catalogAgeAria: "{longLabel} — {count}",
  podcastSingular: "podcast",
  podcastPlural: "podcasts",
  episodeSingular: "episode",
  episodePlural: "episodes",

  /* ------------------------------------------------------------- âges */
  ageYears: "{age} years old",
  ageYearsPlus: "{age} and up",
  ageShortOpen: "{age}+",
  listAnd: "and",

  /* ------------------------------------------------------------- cartes */
  coverAlt: "Cover art for the podcast “{name}”",
  cardFeatures: "Features of {name}",
  cardAgesCovered: "Ages covered: {ages}",
  cardAgesSr: "— ages {ages}",
  unknownAuthor: "Unknown",

  /* ------------------------------------------------------------- fiche */
  breadcrumb: "Breadcrumb",
  detailFeatures: "Podcast features",
  detailEpisodeCount: "{count} episode(s)",
  detailListenExternal: "Listen on the publisher's site",
  detailRss: "RSS feed",
  detailCopyRss: "Copy feed",
  detailCopyRssAria: "Copy the RSS feed URL",
  detailDescription: "Description",
  detailEpisodes: "Episodes",
  detailDescriptionFallback: "{name} — podcast in {language}, publisher {publisher}.",
  favorite: "Favorite",
  unfavorite: "Remove",
  favoriteAddAria: "Add to favorites",
  favoriteRemoveAria: "Remove from favorites",

  /* ------------------------------------------------------------- épisodes */
  episodesUpdated: "Episodes updated on",
  episodesIndexed: "{count} episode(s) indexed ({total} total in the feed)",
  episodesIndexedSuffix: "({total} total in the feed)",
  episodeNumber: "Episode {number}",
  episodeUnavailable: "Playback unavailable here — use the external link.",
  episodeListen: "Listen",
  episodeListenSr: "the episode",
  episodeListenAria: "Listen to “{title}”",
  episodeDownload: "Download",
  episodeDownloadAria: "Download “{title}”",
  episodesEmptyTitle: "Episodes being indexed…",
  episodesEmptyText:
    "This podcast's episode list is not published yet. It will appear automatically on the next feed indexing.",
  episodesListenExternal: "Listen on the publisher's site",
  episodesViewRss: "View RSS feed",
  durationAria: "Duration: {duration}",

  /* ------------------------------------------------------------- recherche */
  searchTitle: "Search episodes",
  searchDescription:
    "Full-text search across every episode in the catalogue — instant results, direct playback.",
  searchHeading: "Search episodes",
  searchIntroBefore: "Type a keyword (e.g.",
  searchIntroMiddle: "…) — search covers the titles and descriptions of",
  searchIntroAfter: "episodes.",
  searchExample1: "dinosaurs",
  searchExample2: "bedtime story",
  searchExample3: "space",
  searchFormLabel: "Episode search",
  searchQueryLabel: "Search for an episode",
  searchPlaceholder: "Title, description, podcast… (e.g. “dinosaurs”)",
  searchHintBefore: "Shortcut: press",
  searchHintMiddle: "to focus ·",
  searchHintEscape: "Esc",
  searchHintAfter: "to clear · Results update live",
  searchFilters: "Filters",
  searchFilterLanguage: "Filter by language",
  searchFilterCategory: "Filter by category",
  searchFilterAge: "Filter by age range",
  searchAge: "Age range",
  searchAllAges: "All ages",
  searchEmpty: "No episode matches your search.",
  searchLoading: "Loading the index…",
  searchError: "Could not load the search index.",
  searchFeatures: "Features",
  searchListenAria: "Listen to this episode",
  searchViewPodcast: "View podcast",
  searchIndexLoaded: "Search index loaded: {count} episodes",
  searchIndexError: "Search index load error:",

  /* ------------------------------------------------------------- favoris */
  favoritesTitle: "My favorites",
  favoritesDescription:
    "Podcasts marked as favorites — stored locally in your browser, synced across tabs.",
  favoritesHeading: "My favorites",
  favoritesIntro:
    "Your favorite podcasts, saved locally. Click the heart on any card to add or remove.",
  favoritesEmptyTitle: "No favorites yet",
  favoritesEmptyBefore: "Browse the",
  favoritesEmptyCatalogue: "catalogue",
  favoritesEmptyAfter: "and click the heart on a card to add it here.",
  favoritesJsonLdName: "My favorites",
  favoritesJsonLdDescription: "Your favorite podcasts — saved locally in your browser",

  /* ------------------------------------------------------------- nouveautés */
  newReleasesTitle: "New releases",
  newReleasesDescription:
    "The {count} most recent episodes in the catalogue — all languages and age ranges.",
  newReleasesHeading: "New releases",
  newReleasesIntro: "The most recently published episodes, across all languages and age ranges.",
  newReleasesCount: "{count} recent episodes",
  newReleasesEmpty: "No episodes indexed yet.",
  newReleasesViewPodcast: "View podcast",
  newReleasesCoverAlt: "Cover art for {name}",
  newReleasesJsonLdName: "New episodes — Podcast directory",

  /* ------------------------------------------------------------- thèmes */
  themesTitle: "Themes",
  themesDescription:
    "{count} themes to discover podcasts by topic — animals, space, history, science, music and more.",
  themesHeading: "Themes",
  themesIntro: "Browse podcasts by theme — each theme groups podcasts on the same topic.",
  themesCount: "{count} themes",
  themesJsonLdName: "Themes",
  themesJsonLdDescription: "All themes in the kids' podcast directory",
  themeAllThemes: "All themes",
  themeTagged: "{count} podcasts tagged “{label}”.",
  themeDescription:
    "{count} podcasts on the theme “{label}” — direct listening, description and a link to the publisher's site.",
  themeJsonLdName: "Podcasts — {label}",

  /* ------------------------------------------------------------- auteurs */
  authorsTitle: "Authors — Podcast directory",
  authorsHeading: "Authors / hosts",
  authorsDescription: "{count} authors / hosts — {podcasts} organised by creator.",
  authorsIntro: "Discover podcasts by author, host or main creator.",
  authorsCount: "{count} authors · {podcasts}",
  authorsAll: "All authors",
  authorsJsonLdName: "Authors",
  authorsJsonLdDescription: "All authors / hosts in the kids' podcast directory",
  authorJsonLdName: "Podcasts — {name}",
  authorDescription:
    "{count} podcasts by author / host “{name}” — direct listening, description and a link to the site.",
  authorIntro: "{count} podcasts created / hosted by “{name}”.",

  /* ------------------------------------------------------------- éditeurs */
  publishersTitle: "Publishers — Podcast directory",
  publishersHeading: "Publishers",
  publishersDescription: "{count} publishers — {podcasts} organised by publishing house.",
  publishersIntro: "Discover podcasts by publishing house / producer.",
  publishersCount: "{count} publishers · {podcasts}",
  publishersAll: "All publishers",
  publishersJsonLdName: "Publishers",
  publishersJsonLdDescription: "All publishers in the kids' podcast directory",
  publisherJsonLdName: "Podcasts — {name}",
  publisherDescription:
    "{count} podcasts from publisher “{name}” — direct listening, description and a link to the publisher's site.",
  publisherIntro: "{count} podcasts published by “{name}”.",
  publisherAuthorsHeading: "Authors from this publisher",

  /* ------------------------------------------------------------- langues */
  languagePodcastsTitle: "Podcasts in {language}",
  languagePodcastsDescription:
    "{count} podcasts in {language}, all age ranges: direct listening, description and a link to the publisher's site.",
  languagePodcastsIntro:
    "Browse all podcasts in {language}. Use search and filters to narrow the list.",

  /* ------------------------------------------------------------- redirections */
  redirectPageTitle: "Page moved",
  redirectPageText: "This page has moved:",
  redirectContinue: "continue to {target}",
};

export const messages: Record<Locale, Record<MessageKey, string>> = { fr, en };

/** Traduit une clé et remplace les jetons `{nom}` par leurs valeurs. */
export function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = messages[locale][key] ?? messages.fr[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** « 1 podcast » / « 2 podcasts » (règles de pluriel d'`Intl`). */
export function plural(
  locale: Locale,
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  const form = new Intl.PluralRules(locale).select(count) === "one" ? singular : pluralForm;
  return `${count} ${form}`;
}
