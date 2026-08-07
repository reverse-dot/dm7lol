/**
 * update-data.js
 * ------------------------------------------------------------
 * Consulta la Riot Games API para cada cuenta listada en
 * config/accounts.json y regenera data/players.json, que es lo
 * único que la web (index.html/app.js) lee.
 *
 * Por qué existe este script y no se llama a la API desde el navegador:
 *  1) La Riot API no envía headers CORS, así que un fetch() desde
 *     una página estática en GitHub Pages es rechazado por el navegador.
 *  2) Nunca hay que exponer una API key en código client-side público.
 * Por eso esto corre en Node (localmente o en GitHub Actions) y el
 * resultado -ya sin la key- se commitea como JSON estático.
 *
 * Uso local:
 *   export RIOT_API_KEY="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 *   node scripts/update-data.js
 *
 * Requisitos: Node 18+ (usa fetch nativo). No necesita dependencias.
 * ------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.RIOT_API_KEY;
if (!API_KEY) {
  console.error("ERROR: falta la variable de entorno RIOT_API_KEY.");
  console.error('Conseguí una key en https://developer.riotgames.com/ y corré:');
  console.error('  export RIOT_API_KEY="tu-key"');
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const ACCOUNTS_PATH = path.join(ROOT, "config", "accounts.json");
const OUTPUT_PATH = path.join(ROOT, "data", "players.json");

// Las dev keys de Riot limitan a 20 req/1s y 100 req/2min.
// Con este delay entre llamadas nos quedamos cómodamente por debajo.
const REQUEST_DELAY_MS = 900;

const DDRAGON_VERSION = "14.15.1";

// Mismo criterio de orden que usa la web (app.js): tier + división + LP,
// no solo LP. Así un Emerald I con menos LP queda arriba de un Emerald IV
// con más LP.
const TIER_ORDER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM",
  "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
];
const DIVISION_ORDER = { "IV": 0, "III": 1, "II": 2, "I": 3 };

function rankScore(p) {
  if (!p.elo) return -1;
  const parts = p.elo.trim().split(/\s+/);
  const tierIdx = TIER_ORDER.indexOf((parts[0] || "").toUpperCase());
  const divisionRoman = parts[1] || null;
  const divisionIdx = divisionRoman && DIVISION_ORDER[divisionRoman] !== undefined
    ? DIVISION_ORDER[divisionRoman]
    : 4;
  return (tierIdx + 1) * 100000 + divisionIdx * 10000 + (p.lp || 0);
}

main().catch(err => {
  console.error("Fallo el update:", err);
  process.exit(1);
});

async function main() {
  const config = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf-8"));
  const previous = loadPrevious();

  const results = [];
  for (const account of config.accounts) {
    console.log(`→ Actualizando ${account.riotId}#${account.tagLine}...`);
    try {
      const player = await buildPlayer(account, previous);
      results.push(player);
    } catch (err) {
      console.error(`  ⚠ No se pudo actualizar ${account.riotId}: ${err.message}`);
      // Si falla una cuenta puntual (rate limit, nombre cambiado, etc.)
      // conservamos su último snapshot en vez de romper todo el ranking.
      const prev = previous?.players?.find(p => p.summonerName === account.riotId);
      if (prev) results.push(prev);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  results.sort((a, b) => rankScore(b) - rankScore(a));
  results.forEach((p, i) => (p.rank = i + 1));

  const output = {
    updatedAt: new Date().toISOString(),
    tournamentEndsAt: config.tournamentEndsAt,
    players: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✔ data/players.json actualizado con ${results.length} jugadores.`);
}

function loadPrevious() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function buildPlayer(account, previous) {
  const { riotId, tagLine, region, platform, displayTag, opggUrl, role } = account;

  // 1) account-v1: riot id -> puuid
  const acc = await riotFetch(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId)}/${encodeURIComponent(tagLine)}`
  );

  // 2) summoner-v4: puuid -> profileIconId, summonerLevel.
  // OJO: desde 2025 Riot sacó el campo "id" (encryptedSummonerId) de esta
  // respuesta, así que ya NO se puede usar summoner.id para nada.
  const summoner = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`
  );

  // 3) league-v4: puuid -> ranked solo/duo entry (tier, división, LP, W/L)
  // El endpoint viejo (/entries/by-summoner/{summonerId}) fue eliminado por
  // Riot el 20 de junio de 2025. Ahora se usa directo por puuid.
  const entries = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${acc.puuid}`
  );
  const solo = entries.find(e => e.queueType === "RANKED_SOLO_5x5");

  // 4) match-v5: últimas 20 partidas de SoloQ -> historial W/L para "Racha"
  const matchIds = await riotFetch(
    `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?queue=420&count=20`
  );
  const last20 = [];
  for (const id of matchIds) {
    await sleep(REQUEST_DELAY_MS);
    const match = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`);
    const me = match.info.participants.find(p => p.puuid === acc.puuid);
    last20.push(me?.win ? 1 : 0);
  }

  // 5) spectator-v5: ¿está en partida ahora mismo?
  // Riot está desactivando spectator-v5 para LoL (cambios de anonimato,
  // patch 25.20 en adelante), así que cualquier error acá -no solo el 404
  // normal de "no está jugando"- se trata simplemente como inGame:false
  // en vez de tirar abajo la actualización del jugador.
  let inGame = false;
  try {
    await riotFetch(`https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${acc.puuid}`);
    inGame = true;
  } catch {
    inGame = false;
  }

  // Riot no expone el delta de LP por partida, así que estimamos
  // ganancia/pérdida de las últimas 24h con un valor típico de SoloQ (~21 LP)
  // aplicado a los resultados del período. Es una aproximación visual,
  // no un dato exacto de la API.
  const winsLast20 = last20.filter(x => x === 1).length;
  const lossesLast20 = last20.length - winsLast20;

  // Campos que Riot no provee (shells, live) se heredan del snapshot
  // anterior para que el organizador los edite a mano en data/players.json
  // sin perderlos cada 24h.
  const prevPlayer = previous?.players?.find(p => p.summonerName === riotId);

  return {
    rank: 0, // se recalcula en main()
    summonerName: riotId,
    riotTag: displayTag || `${riotId}#${tagLine}`,
    avatar: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${summoner.profileIconId}.png`,
    verified: true,
    elo: solo ? formatTier(solo) : "Sin clasificar",
    lp: solo ? solo.leaguePoints : 0,
    wins: solo ? solo.wins : 0,
    losses: solo ? solo.losses : 0,
    last20,
    lpGain24h: estimateGain(winsLast20),
    lpLoss24h: estimateLoss(lossesLast20),
    // "role" es manual: se define en config/accounts.json (top/jungle/mid/adc/support)
    // y si no está seteado ahí, se conserva el último valor cargado a mano.
    role: role || prevPlayer?.role || null,
    shells: prevPlayer?.shells ?? [],
    live: prevPlayer?.live ?? false,
    inGame,
    opggUrl: opggUrl || `https://op.gg/summoners/${platform.replace(/\d+$/, "")}/${riotId}-${tagLine}`,
  };
}

function estimateGain(wins) {
  const AVG = 21;
  return wins * AVG;
}
function estimateLoss(losses) {
  const AVG = 21;
  return losses * AVG;
}

function formatTier(entry) {
  const tier = entry.tier[0] + entry.tier.slice(1).toLowerCase();
  const apex = ["CHALLENGER", "GRANDMASTER", "MASTER"].includes(entry.tier);
  return apex ? tier : `${tier} ${entry.rank}`;
}

async function riotFetch(url) {
  const res = await fetch(url, { headers: { "X-Riot-Token": API_KEY } });
  if (res.status === 404) throw Object.assign(new Error("404 not found"), { status: 404 });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || 5);
    console.log(`  Rate limited, esperando ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return riotFetch(url);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} en ${url}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
