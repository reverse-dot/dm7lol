/* ==========================================================
   SoloQ Challenge Ranking — app.js
   Lee data/players.json (generado por scripts/update-data.js
   o por el workflow de GitHub Actions) y pinta toda la UI.
   No llama a la API de Riot directamente: eso pasa server-side
   porque el navegador no puede llamar la Riot API (CORS + API key).
   ========================================================== */

const DATA_URL = "data/players.json";

const state = {
  players: [],
  updatedAt: null,
  tournamentEndsAt: null,
  filter: "todos",        // todos | high | low
  onlyLive: false,
  onlyInGame: false,
  search: "",
  sortKey: "lp",
  sortDir: "desc",
};

const SHELL_ICONS = {
  skull: "💀",
  flame: "🔥",
  clock: "🕒",
  trophy: "🏆",
};

/* ---------------- ranking por elo (tier + división + LP) ---------------- */

// Orden de tiers de LoL, de más bajo a más alto.
const TIER_ORDER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
  "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
];
// División dentro del tier: I es la más alta, IV la más baja.
const DIVISION_ORDER = { "IV": 0, "III": 1, "II": 2, "I": 3 };

function parseElo(eloStr) {
  if (!eloStr) return { tierIdx: -1, divisionIdx: -1, tierName: "" };
  const parts = eloStr.trim().split(/\s+/);
  const tierName = (parts[0] || "").toUpperCase();
  const divisionRoman = parts[1] || null;
  const tierIdx = TIER_ORDER.indexOf(tierName);
  const divisionIdx = divisionRoman && DIVISION_ORDER[divisionRoman] !== undefined
    ? DIVISION_ORDER[divisionRoman]
    : 4; // tiers apex (Master+) no tienen división -> se tratan como la más alta
  return { tierIdx, divisionIdx, tierName };
}

// Puntaje comparable: primero tier, después división, después LP.
// Así un Emerald I con menos LP siempre queda por encima de un Emerald IV con más LP.
function rankScore(p) {
  const { tierIdx, divisionIdx } = parseElo(p.elo);
  return (tierIdx + 1) * 100000 + divisionIdx * 10000 + (p.lp || 0);
}

function sortByRank(list) {
  return [...list].sort((a, b) => rankScore(b) - rankScore(a));
}

init();

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar " + DATA_URL);
    const json = await res.json();
    state.players = json.players || [];
    state.updatedAt = json.updatedAt ? new Date(json.updatedAt) : new Date();
    state.tournamentEndsAt = json.tournamentEndsAt ? new Date(json.tournamentEndsAt) : null;
  } catch (err) {
    console.error(err);
    document.getElementById("tableBody").innerHTML =
      `<tr><td colspan="9" class="empty-state">No se pudo cargar data/players.json.<br>
       Corré scripts/update-data.js o revisá que el archivo exista.</td></tr>`;
    return;
  }

  renderUpdatedLine();
  startCountdown();
  renderPodium();
  renderTable();
  bindControls();
}

/* ---------------- header ---------------- */

function renderUpdatedLine() {
  const el = document.getElementById("updatedAgo");
  const diffMin = Math.max(0, Math.round((Date.now() - state.updatedAt.getTime()) / 60000));
  if (diffMin < 1) el.textContent = "hace instantes";
  else if (diffMin < 60) el.textContent = `hace ${diffMin} min`;
  else el.textContent = `hace ${Math.round(diffMin / 60)} h`;
}

function startCountdown() {
  const el = document.getElementById("countdown");
  if (!state.tournamentEndsAt) { el.innerHTML = "<span>Sin fecha configurada</span>"; return; }
  tick();
  setInterval(tick, 1000);

  function tick() {
    let diff = state.tournamentEndsAt.getTime() - Date.now();
    if (diff < 0) diff = 0;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML =
      `<span>${d}</span><span class="unit">d</span>` +
      `<span>${pad(h)}</span><span class="unit">h</span>` +
      `<span>${pad(m)}</span><span class="unit">m</span>` +
      `<span>${pad(s)}</span><span class="unit">s</span>`;
  }
}
function pad(n){ return n.toString().padStart(2, "0"); }

/* ---------------- podium (top 3) ---------------- */

function renderPodium() {
  const top3 = sortByRank(state.players).slice(0, 3);
  const medals = ["👑", "🥈", "🥉"];
  const cls = ["rank-1", "rank-2", "rank-3"];

  document.getElementById("podium").innerHTML = top3.map((p, i) => {
    const wr = winrate(p);
    return `
    <div class="podium-card ${cls[i]}">
      <div class="podium-top">
        <span class="rank-medal">${medals[i]}</span>
        <img class="avatar" src="${p.avatar}" alt="${p.summonerName}" onerror="this.style.opacity=0">
        <div class="pname">
          <span class="name">${p.summonerName}</span>
          <span class="tag">${p.riotTag}</span>
        </div>
        <div class="edit-badge">✎</div>
      </div>
      <div class="lp-row">
        ${emblemSvg(46, false, p.elo)}
        <span class="lp-value">${formatLP(p.lp)}<span class="lp-unit">LP</span></span>
      </div>
      <div class="stat-row">
        <div class="stat-col"><b>${p.wins}W ${p.losses}L</b><span>${p.wins + p.losses} partidas</span></div>
        <div class="stat-col"><b>${wr}%</b><span>Winrate</span></div>
        <div class="stat-col"><b>${countWL(p.last20, 1)}W ${countWL(p.last20, 0)}L</b><span>Últimas 20</span></div>
      </div>
      <div class="wl-bar">
        <span class="w" style="width:${wr}%"></span>
        <span class="l" style="width:${100 - wr}%"></span>
      </div>
    </div>`;
  }).join("");
}

/* ---------------- table ---------------- */

function bindControls() {
  document.querySelectorAll("#eloTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#eloTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderTable();
    });
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderTable();
  });

  document.getElementById("liveToggle").addEventListener("click", (e) => {
    state.onlyLive = !state.onlyLive;
    e.currentTarget.classList.toggle("live-active", state.onlyLive);
    renderTable();
  });

  document.getElementById("ingameToggle").addEventListener("click", (e) => {
    state.onlyInGame = !state.onlyInGame;
    e.currentTarget.classList.toggle("live-active", state.onlyInGame);
    renderTable();
  });

  document.querySelectorAll("thead th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      document.querySelectorAll("thead th").forEach(h => h.classList.remove("sorted"));
      th.classList.add("sorted");
      renderTable();
    });
  });
}

function getFiltered() {
  let list = [...state.players];

  if (state.filter === "high") list = list.filter(p => p.lp >= 1800);
  if (state.filter === "low") list = list.filter(p => p.lp < 1800);
  if (state.onlyLive) list = list.filter(p => p.live);
  if (state.onlyInGame) list = list.filter(p => p.inGame);
  if (state.search) {
    list = list.filter(p =>
      p.summonerName.toLowerCase().includes(state.search) ||
      (p.riotTag || "").toLowerCase().includes(state.search)
    );
  }

  const dir = state.sortDir === "desc" ? -1 : 1;
  list.sort((a, b) => {
    switch (state.sortKey) {
      // "Elo" y "#" ordenan por tier + división + LP, no solo por LP.
      case "lp": return (rankScore(a) - rankScore(b)) * dir;
      case "winrate": return (winrate(a) - winrate(b)) * dir;
      case "lpchange": return ((a.lpGain24h - a.lpLoss24h) - (b.lpGain24h - b.lpLoss24h)) * dir;
      case "rank":
      default: return (rankScore(a) - rankScore(b)) * dir * -1; // rank sigue elo+división desc por defecto
    }
  });

  return list;
}

function renderTable() {
  const list = getFiltered();
  const body = document.getElementById("tableBody");

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">No hay jugadores que coincidan con el filtro.</td></tr>`;
    return;
  }

  // El ranking general (medalla / #) siempre sigue tier + división + LP,
  // sin importar por qué columna esté ordenada la tabla en este momento.
  const sortedByRank = sortByRank(state.players);

  body.innerHTML = list.map(p => {
    const overallRank = sortedByRank.findIndex(x => x.summonerName === p.summonerName) + 1;
    const medal = overallRank === 1 ? "👑" : overallRank === 2 ? "🥈" : overallRank === 3 ? "🥉" : overallRank;
    const wr = winrate(p);
    const gain = p.lpGain24h ?? 0;
    const loss = p.lpLoss24h ?? 0;

    return `
    <tr>
      <td class="rank-cell"><span class="medal">${medal}</span></td>
      <td>
        <div class="player-cell">
          <img class="avatar" src="${p.avatar}" alt="" onerror="this.style.opacity=0">
          <div class="pname">
            <span class="name">${p.summonerName}
              ${p.verified ? '<span class="icon-inline">✓</span>' : ""}
              ${p.live ? '<span class="live-chip">● LIVE</span>' : ""}
            </span>
            <span class="tag">${p.riotTag}</span>
          </div>
        </div>
      </td>
      <td><div class="role-icon">${roleIcon(p.role)}</div></td>
      <td>
        <div class="elo-cell">${emblemSvg(20, true, p.elo)} ${formatLP(p.lp)} LP</div>
      </td>
      <td class="vd-cell">
        <div class="vd-top"><span class="wr">${wr}%</span><span class="games">${p.wins}W · ${p.losses}D</span></div>
        <div class="vd-bar">
          <span class="w" style="width:${wr}%"></span>
          <span class="l" style="width:${100 - wr}%"></span>
        </div>
      </td>
      <td class="streak-cell">${sparkline(p.last20)}</td>
      <td class="lp-change">
        <span class="up">▲ ${gain}</span><span class="down">▼ ${loss}</span>
      </td>
      <td>
        <div class="shells-cell">
          ${(p.shells || []).map(s => `<span class="shell-badge">${SHELL_ICONS[s.icon] || "•"} ${s.count ?? s.label ?? ""}</span>`).join("")}
        </div>
      </td>
      <td><a class="opgg-btn ${p.live ? "live" : ""}" href="${p.opggUrl}" target="_blank" rel="noopener">OP.GG</a></td>
    </tr>`;
  }).join("");
}

/* ---------------- helpers ---------------- */

function winrate(p) {
  const total = p.wins + p.losses;
  return total ? Math.round((p.wins / total) * 100) : 0;
}

function countWL(arr, val) {
  return (arr || []).filter(x => x === val).length;
}

function formatLP(n) {
  return n.toLocaleString("es-ES");
}

function sparkline(last20) {
  if (!last20 || !last20.length) return "";
  const w = 100, h = 30, pad = 3;
  const step = (w - pad * 2) / (last20.length - 1);
  let cum = 0;
  const pts = last20.map((v, i) => {
    cum += v === 1 ? 1 : -1;
    return { x: pad + i * step, y: cum };
  });
  const maxAbs = Math.max(1, ...pts.map(p => Math.abs(p.y)));
  const scaled = pts.map(p => ({ x: p.x, y: h / 2 - (p.y / maxAbs) * (h / 2 - pad) }));
  const d = scaled.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const trendUp = scaled[scaled.length - 1].y < scaled[0].y;
  const color = trendUp ? "#34d67a" : "#ff4d6d";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------- rol (icono por posición) ---------------- */

const ROLE_KEYS = ["top", "jungle", "mid", "adc", "support"];
const ROLE_LABELS = { top: "Top", jungle: "Jungla", mid: "Mid", adc: "ADC", support: "Support" };
const ROLE_FALLBACK = "⚑";

// Busca los íconos en assets/roles/{top,jungle,mid,adc,support}.webp.
// Si el archivo no existe todavía (o el rol no está definido), muestra
// un badge genérico en su lugar — no rompe la tabla.
function roleIcon(role) {
  const key = (role || "").toLowerCase();
  if (!ROLE_KEYS.includes(key)) {
    return `<span class="role-fallback" title="Rol no definido">${ROLE_FALLBACK}</span>`;
  }
  const label = ROLE_LABELS[key];
  return `<img class="role-img" src="assets/roles/${key}.webp" alt="${label}" title="${label}"
    onerror="this.outerHTML='<span class=&quot;role-fallback&quot; title=&quot;${label}&quot;>${ROLE_FALLBACK}</span>'">`;
}

/* ---------------- emblema de rango (imagen oficial de LoL, por CDN) ---------------- */

// Emblemas oficiales de Riot Games, servidos por CommunityDragon (mirror
// público creado bajo la política "Legal Jibber Jabber" de Riot — el mismo
// mecanismo por el que ya se usa ddragon.leagueoflegends.com para los avatares
// más arriba). No se copian archivos: el navegador pide la imagen directo
// a ese CDN, igual que ya hace con `avatar`.
const EMBLEM_CDN =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-emblem/emblem-";

// Tiers que tienen emblema disponible en el CDN.
const EMBLEM_TIERS = new Set([
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
  "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
]);

function emblemSvg(size, small, eloStr) {
  const { tierName } = parseElo(eloStr);
  const cls = small ? "emblem-sm" : "emblem";

  if (!EMBLEM_TIERS.has(tierName)) {
    // "Sin clasificar" u otro valor no reconocido: sin emblema.
    return `<span class="${cls} emblem-empty" style="width:${size}px;height:${size}px"></span>`;
  }

  const key = tierName.toLowerCase();
  const label = tierName[0] + tierName.slice(1).toLowerCase();
  return `<img class="${cls}" width="${size}" height="${size}"
    src="${EMBLEM_CDN}${key}.png" alt="${label}" title="${label}"
    onerror="this.style.opacity=0">`;
}
