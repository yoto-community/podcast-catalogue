// health-client.js — Client-side logic for the health page
// Fetches /api/health.json at runtime and populates the table

document.addEventListener("DOMContentLoaded", async () => {
  // éléments du DOM
  const tableBody = document.getElementById("health-table-body");
  const cacheEl = document.getElementById("cache-timestamp");
  const statHealthy = document.getElementById("stat-healthy");
  const statStale = document.getElementById("stat-stale");
  const statUnhealthy = document.getElementById("stat-unhealthy");
  const statUnknown = document.getElementById("stat-unknown");
  const noResultsEl = document.querySelector("[data-health-no-results]");
  const visibleCountEl = document.querySelector("[data-health-visible]");

  // État de tri
  let sortColumn = "status";
  let sortDirection = "asc";
  const statusOrder = { unhealthy: 0, stale: 1, healthy: 2, unknown: 3 };

  // Fonction pour formater la date relative
  function formatRelative(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMs < 1) return "à l'instant";
    if (diffMins < 60) return `il y a ${diffMins} min`;
    if (diffHours < 24) return `il y a ${diffHours} h`;
    if (diffDays < 30) return `il y a ${diffDays} j`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `il y a ${diffMonths} mois`;
    const diffYears = Math.floor(diffDays / 365);
    return `il y a ${diffYears > 1 ? `${diffYears} ans` : `${diffYears} an`}`;
  }

  // Fonction pour formater la date longue
  function formatDateLong(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 1) return "à l'instant";
    if (diffDays < 30) return `il y a ${diffDays} j`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `il y a ${diffMonths} mois`;
    const diffYears = Math.floor(diffDays / 365);
    return `il y a ${diffYears > 1 ? `${Math.floor(diffYears)} ans` : `${Math.floor(diffYears)} an`}`;
  }

  // ---- Rendre la table à partir des données de santé ----
  function renderTable(healthData) {
    // healthData = { bySlug, byEntryName, summary, timestamp }

    // Construire la liste des lignes à partir des entrées + données de santé
    const rows = [];

    // Récupérer les podcasts depuis l'API (stockés dans healthData par le render global)
    // On utilise les entrées connues + les données de santé
    const entries = /* global */ entries || [];

    for (const entry of entries) {
      const slug = entry.slug;
      const health = healthData.bySlug?.[slug];
      const status = health?.status ?? "unknown";
      const lastChecked = health?.lastChecked ?? "";
      const error = health?.error;
      const warnings = health?.warnings ?? [];

      // Trouver le résultat de l'API par slug ou par nom
      const apiEntry = podcastsCache?.find(
        (p) => p.slug === slug || p.name === entry.name
      );

      const lastFetch = apiEntry?.lastFetch ?? lastChecked;
      const lastEpisodeDate = apiEntry?.episodes?.[0]?.pubDate ?? null;
      const episodeCount =
        apiEntry?.episodeCount ?? (apiEntry?.episodes?.length ?? 0);

      rows.push({
        entry,
        feedStatus: status,
        lastFetch,
        lastEpisodeDate,
        episodeCount,
        error,
        warnings,
        episodes: apiEntry?.episodes ?? null,
      });
    }

    // Trier par statut
    rows.sort((a, b) => statusOrder[a.feedStatus] - statusOrder[b.feedStatus]);

    // Vider et remplir le tbody
    tableBody.innerHTML = "";
    let visibleCount = 0;

    rows.forEach((health) => {
      const {
        entry,
        feedStatus,
        lastFetch,
        lastEpisodeDate,
        episodeCount,
        error,
        warnings,
        episodes,
      } = health;

      const tr = document.createElement("tr");
      tr.dataset.status = feedStatus;
      tr.dataset.language = entry.language;
      tr.dataset.group = entry.groupId;

      // Dataset search
      const searchText =
        entry.name.toLowerCase() +
        " " +
        (entry.publisher ?? "").toLowerCase() +
        " " +
        (error?.toLowerCase() ?? "") +
        " " +
        (warnings?.map((w) => w.message.toLowerCase()).join(" ") ?? "");
      tr.dataset.search = searchText;

      // Icone statut
      const statusIcon =
        feedStatus === "healthy"
          ? "🟢"
          : feedStatus === "stale"
            ? "🟡"
            : feedStatus === "unhealthy"
              ? "🔴"
              : "⚪";
      const statusLabel =
        feedStatus === "healthy"
          ? "Sain"
          : feedStatus === "stale"
            ? "Obsolète"
              : feedStatus === "unhealthy"
                ? "Défaillant"
                : "Inconnu";

      // Formatages
      const fetchDate = lastFetch ? formatRelative(lastFetch) : "—";
      const fetchDay = lastFetch ? isoDay(lastFetch) : null;
      const lastEpDate = lastEpisodeDate ? formatDateLong(lastEpisodeDate) : "—";
      const lastEpRelative = lastEpisodeDate ? formatRelative(lastEpisodeDate) : "—";

      // Compteur visible
      if (feedStatus !== "unknown" || entry.name.toLowerCase().includes(" ") || true)
        visibleCount++;

      // HTML de la ligne
      const statusBadgeClass = `health__status-badge health__status-badge--${feedStatus}`;
      tr.innerHTML = `
        <td class="health__podcast-cell">
          <a href="#" class="health__podcast-link">
            <img src="${entry.imageUrl || pageUrl("/placeholder.svg")}" alt="" width="32" height="32" loading="lazy" decoding="async" />
            <div class="health__podcast-info">
              <span class="health__podcast-name">${entry.name}</span>
              <span class="health__publisher">${entry.publisher ?? ""}</span>
            </div>
          </a>
        </td>
        <td data-label="Langue" data-sort-value="${entry.language}">
          <span class="badge">${entry.language === "fr" ? "Français" : "English"}</span>
        </td>
        <td data-label="Tranche" data-sort-value="${entry.groupId}">
          <span class="badge">${entry.ageRange}</span>
        </td>
        <td class="health__status" data-label="Statut" data-sort-value="${feedStatus}">
          <span class="${statusBadgeClass}" aria-label="${statusLabel}">
            ${statusIcon} ${statusLabel}
          </span>
        </td>
        <td data-label="Dernière récupération" data-sort-value="${lastFetch ?? ""}">
          ${fetchDate && (
            <span>
              <time datetime="${fetchDay ?? lastFetch}">${fetchDate}</time>
              <span class="health__relative">(formatRelative(lastFetch))</span>
            </span>
          )}
          {!lastFetch && <span class="health__never">Jamais</span>}
        </td>
        <td data-label="Dernier épisode" data-sort-value="${lastEpisodeDate ?? ""}">
          ${lastEpDate && (
            <span>
              <time datetime="${lastEpDate ? isoDay(lastEpDate) : lastEpisodeDate}">${lastEpDate}</time>
              <span class="health__relative">(formatRelative(lastEpisodeDate))</span>
            </span>
          )}
          {!lastEpDate && <span class="health__never">—</span>}
        </td>
        <td data-label="Épisodes" data-sort-value="${episodeCount}">
          <span class="health__episode-count">${episodeCount} épisode${episodeCount > 1 ? "s" : ""}</span>
        </td>
        <td class="health__actions" data-label="Actions">
          ${warnings && warnings.length > 0 ? (
            `<button type="button" class="btn btn--ghost btn--sm health__warnings-toggle" aria-expanded="false" aria-controls="warnings-${entry.slug}" data-target="warnings-${entry.slug}">
              ${warnings.length} avertissement${warnings.length > 1 ? "s" : ""}
            </button>`
          ) : ""}
          ${error && (
            `<details class="health__error">
              <summary>Erreur</summary>
              <pre>${error}</pre>
            </details>`
          )}
          ${episodes && (
            `<a href="#" class="btn btn--ghost btn--sm">Voir épisodes</a>`
          )}
          <a
            href="${entry.rssUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn--ghost btn--sm"
          >
            Flux RSS
          </a>
        </td>
      `;

      tableBody.appendChild(tr);

      // Row warnings (inséré après la ligne principale)
      if (warnings && warnings.length > 0) {
        const warningsTr = document.createElement("tr");
        warningsTr.id = `warnings-${entry.slug}`;
        warningsTr.className = "health__warnings-row hidden";
        const liItems = warnings.map((w) => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="health__warning-rule">[${w.rule}]</span><span class="health__warning-message">${w.message}</span>`;
          return li.outerHTML;
        });
        warningsTr.innerHTML = `
          <td colspan="8" class="health__warnings-cell">
            <details open>
              <summary>Avertissements détaillés</summary>
              <ul class="health__warnings-list">
                ${liItems.join("")}
              </ul>
            </details>
          </td>
        `;
        tableBody.appendChild(warningsTr);
      }
    });

    // Mise à jour du compteur et de l'état "aucun résultat"
    if (noResultsEl) {
      const visibleRows = Array.from(tableBody.querySelectorAll("tr:not(.health__warnings-row)")).filter(
        (row) => !row.hidden
      ).length;
      noResultsEl.hidden = visibleRows > 0;
    }
    if (visibleCountEl) {
      const visibleRows = Array.from(tableBody.querySelectorAll("tr:not(.health__warnings-row)")).filter(
        (row) => !row.hidden
      ).length;
      visibleCountEl.textContent = String(visibleRows);
    }
  }

  // ---- Gestion des filtres et tris ----
  // Les éléments seront peuplés après le rendu

  // Fonction pour appliquer les filtres
  function applyFilters() {
    if (!tableBody.children.length) return;

    const statusFilter = document.querySelector('select[aria-label="Filtrer par statut"]');
    const languageFilter = document.querySelector('select[aria-label="Filtrer par langue"]');
    const groupFilter = document.querySelector('select[aria-label="Filtrer par tranche d\'âge"]');
    const searchInput = document.querySelector('input[placeholder="Rechercher un podcast…"]');

    const status = statusFilter?.value ?? "";
    const language = languageFilter?.value ?? "";
    const group = groupFilter?.value ?? "";
    const search = (searchInput?.value ?? "").toLowerCase();

    // Récupérer les lignes du tableau
    const rows = Array.from(tableBody.querySelectorAll("tr:not(.health__warnings-row)"));

    rows.forEach((row) => {
      const matchesStatus = !status || row.dataset.status === status;
      const matchesLanguage = !language || row.dataset.language === language;
      const matchesGroup = !group || row.dataset.group === group;
      const matchesSearch = !search || row.dataset.search?.includes(search);

      const visible = matchesStatus && matchesLanguage && matchesGroup && matchesSearch;
      row.hidden = !visible;
    });

    // Also toggle warnings rows
    tableBody.querySelectorAll(".health__warnings-row").forEach((warningsRow) => {
      const targetId = warningsRow.querySelector(".health__warnings-toggle")?.dataset.target;
      if (targetId) {
        const parentRow = warningsRow.previousElementSibling;
        if (parentRow) {
          warningsRow.hidden = !rows.some((r) => r === parentRow && !row.hidden);
        }
      }
    });

    // Update chips + count + URL
    updateFilterChips();
    updateResultCount();

    // Mise à jour de l'URL
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (language) params.set("lang", language);
    if (group) params.set("group", group);
    if (search) params.set("q", search);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }

  function updateFilterChips() {
    // Collecter les valeurs actives depuis les filtres DOM
    const statusFilter = document.querySelector('select[aria-label="Filtrer par statut"]');
    const languageFilter = document.querySelector('select[aria-label="Filtrer par langue"]');
    const groupFilter = document.querySelector('select[aria-label="Filtrer par tranche d\'âge"]');
    const searchInput = document.querySelector('input[placeholder="Rechercher un podcast…"]');

    const chips = [];

    if (statusFilter && statusFilter.value) {
      chips.push({ id: "status", label: "Statut", value: statusFilter.value });
    }
    if (languageFilter && languageFilter.value) {
      chips.push({
        id: "language",
        label: "Langue",
        value: languageFilter.value === "fr" ? "Français" : "English",
      });
    }
    if (groupFilter && groupFilter.value) {
      chips.push({ id: "group", label: "Tranche", value: groupFilter.value });
    }
    if (searchInput && searchInput.value) {
      chips.push({ id: "search", label: "Recherche", value: `«${searchInput.value}»` });
    }

    const activeFiltersContainer = document.querySelector(".health__active-filters");
    const filterChipsContainer = document.querySelector(".health__filter-chips");

    if (!activeFiltersContainer || !filterChipsContainer) return;

    if (chips.length > 0) {
      activeFiltersContainer.hidden = false;
      filterChipsContainer.innerHTML = chips
        .map(
          (chip) => `
        <span class="health__filter-chip" data-filter-id="${chip.id}" data-filter-value="${chip.value}">
          ${chip.label}: ${chip.value}
          <button type="button" aria-label="Retirer le filtre ${chip.label}">×</button>
        </span>`
        )
        .join("");
    } else {
      activeFiltersContainer.hidden = true;
      filterChipsContainer.innerHTML = "";
    }
  }

  function updateResultCount() {
    if (!tableBody.children.length) return;
    const visibleCount = Array.from(tableBody.querySelectorAll("tr:not(.health__warnings-row)")).filter(
      (row) => !row.hidden
    ).length;
    if (visibleCountEl) visibleCountEl.textContent = String(visibleCount);

    const noResultsEl = document.querySelector("[data-health-no-results]");
    if (noResultsEl) noResultsEl.hidden = visibleCount > 0;
  }

  // Écouteurs d'événements - après que le tableau a étérenderé
  // On délaisse un peu pour que le DOM soit prêt
  setTimeout(() => {
    // Filtres
    const statusFilter = document.querySelector('select[aria-label="Filtrer par statut"]');
    const languageFilter = document.querySelector('select[aria-label="Filtrer par langue"]');
    const groupFilter = document.querySelector('select[aria-label="Filtrer par tranche d\'âge"]');
    const searchInput = document.querySelector('input[placeholder="Rechercher un podcast…"]');
    const clearButton = document.querySelector('#health-filter-clear');
    const activeFiltersContainer = document.querySelector(".health__active-filters");
    const filterChipsContainer = document.querySelector(".health__filter-chips");
    const clearAllButton = document.querySelector('.health__clear-all');

    if (statusFilter) statusFilter.addEventListener("change", applyFilters);
    if (languageFilter) languageFilter.addEventListener("change", applyFilters);
    if (groupFilter) groupFilter.addEventListener("change", applyFilters);
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout((searchInput).__debounceTimer);
        searchInput.__debounceTimer = setTimeout(applyFilters, 150);
      });
    }
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        if (statusFilter) statusFilter.value = "";
        if (languageFilter) languageFilter.value = "";
        if (groupFilter) groupFilter.value = "";
        if (searchInput) searchInput.value = "";
        applyFilters();
      });
    }
    if (clearAllButton) {
      clearAllButton.addEventListener("click", () => {
        if (statusFilter) statusFilter.value = "";
        if (languageFilter) languageFilter.value = "";
        if (groupFilter) groupFilter.value = "";
        if (searchInput) searchInput.value = "";
        applyFilters();
      });
    }

    // Boutons de réinitialisation
    const resetButton = document.querySelector("[data-health-reset]");
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        if (statusFilter) statusFilter.value = "";
        if (languageFilter) languageFilter.value = "";
        if (groupFilter) groupFilter.value = "";
        if (searchInput) searchInput.value = "";
        applyFilters();
      });
    }
  }, 200);
});