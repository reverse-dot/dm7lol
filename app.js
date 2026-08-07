/* ==========================================================
   SoloQ Challenge — app.js
   - Ranking desde data/players.json
   - Sistema de castigos via Firebase Firestore
   - Login simple por contraseña (config/users.js)
   ========================================================== */

/* ============================================================
   CASTIGOS — 8 opciones aleatorias
   ============================================================ */
const PUNISHMENTS = [
  { id: 1, icon: "🤡", name: "Clown Mode",       desc: "Jugar la próxima partida con el campeón más troll del parche." },
  { id: 2, icon: "🔇", name: "Silencio total",    desc: "Mutear a todos y jugar sin comunicación la siguiente partida." },
  { id: 3, icon: "🐌", name: "Slow Motion",       desc: "Jugar solo con objetos de movimiento, sin daño por 1 partida." },
  { id: 4, icon: "🎯", name: "Mid or Feed",       desc: "Solo puede ir a mid, aunque no sea su rol, en la próxima partida." },
  { id: 5, icon: "🙈", name: "No mires el mapa",  desc: "Prohibido mirar el minimapa durante toda la siguiente partida." },
  { id: 6, icon: "🎪", name: "Support vida",      desc: "Jugar de support con build full AP sin importar el campeón." },
  { id: 7, icon: "💸", name: "Gastador",          desc: "Debe gastar todo el oro apenas lo tenga, sin guardar nada." },
  { id: 8, icon: "🦆", name: "El Pato",           desc: "Escribir 'cuac' en el chat cada vez que muera en la partida." },
];

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas

/* ============================================================
   FIREBASE — inicialización
   ============================================================ */
let db = null;

function initFirebase() {
  try {
    if (typeof FIREBASE_CONFIG === "undefined") throw new Error("firebase.js no encontrado");
    if (FIREBASE_CONFIG.apiKey === "TU_API_KEY") {
      console.warn("⚠️  Firebase no configurado. Los castigos no se guardarán entre sesiones.");
      return false;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    return true;
  } catch(e) {
    console.warn("Firebase no disponible:", e.message);
    return false;
  }
}

/* Cache local de castigos (fallback sin Firebase) */
let localPunishments = {}; // { targetName: { punishment, senderName, sentAt } }

async function loadPunishments() {
  if (!db) return localPunishments;
  try {
    const now = Date.now();
    const cutoff = new Date(now - COOLDOWN_MS);
    const snap = await db.collection("punishments")
      .where("sentAt", ">", cutoff)
      .get();
    const result = {};
    snap.forEach(doc => {
      const d = doc.data();
      result[d.targetName] = { punishment: d.punishment, senderName: d.senderName, sentAt: d.sentAt.toDate() };
    });
    return result;
  } catch(e) {
    console.error("Error cargando castigos:", e);
    return localPunishments;
  }
}

async function savePunishment(targetName, senderName, punishment) {
  const record = { punishment, senderName, sentAt: new Date() };
  localPunishments[targetName] = record;
  if (!db) return;
  try {
    // Usa targetName como doc ID para que solo haya un castigo activo por persona
    await db.collection("punishments").doc(targetName).set({
      targetName, senderName,
      punishment,
      sentAt: firebase.firestore.Timestamp.fromDate(record.sentAt),
    });
  } catch(e) {
    console.error("Error guardando castigo:", e);
  }
}

async function getSenderCooldown(senderName) {
  if (!db) {
    // En local: buscar si este sender tiene algún castigo reciente
    return Object.values(localPunishments).find(
      r => r.senderName === senderName && (Date.now() - r.sentAt.getTime()) < COOLDOWN_MS
    ) || null;
  }
  try {
    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const snap = await db.collection("punishments")
      .where("senderName", "==", senderName)
      .where("sentAt", ">", cutoff)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return { sentAt: d.sentAt.toDate() };
  } catch(e) {
    return null;
  }
}

/* ============================================================
   AUTH — login simple
   ============================================================ */
let currentUser = null; // { player: "X1no" }

function authInit() {
  // Cargar sesión guardada
  try {
    const saved = sessionStorage.getItem("sq_user");
    if (saved) {
      currentUser = JSON.parse(saved);
      updateAuthUI();
    }
  } catch(_) {}

  // Poblar select de jugadores
  const sel = document.getElementById("loginPlayer");
  (typeof USERS !== "undefined" ? USERS : []).forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.player;
    opt.textContent = u.player;
    sel.appendChild(opt);
  });

  // Botones
  document.getElementById("btnOpenLogin").addEventListener("click", () => openModal("loginModal"));
  document.getElementById("btnCloseLogin").addEventListener("click", () => closeModal("loginModal"));
  document.getElementById("btnLogout").addEventListener("click", logout);
  document.getElementById("loginModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal("loginModal");
  });

  document.getElementById("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("btnLogin").addEventListener("click", doLogin);
}

function doLogin() {
  const player = document.getElementById("loginPlayer").value;
  const pwd    = document.getElementById("loginPassword").value;
  const errEl  = document.getElementById("loginError");

  if (!player) { errEl.textContent = "Seleccioná tu jugador."; errEl.classList.remove("hidden"); return; }

  const users = typeof USERS !== "undefined" ? USERS : [];
  const match = users.find(u => u.player === player && u.password === pwd);

  if (!match) {
    errEl.classList.remove("hidden");
    const modal = document.querySelector("#loginModal > div");
    modal.classList.add("shake");
    setTimeout(() => modal.classList.remove("shake"), 400);
    return;
  }

  errEl.classList.add("hidden");
  currentUser = { player: match.player };
  sessionStorage.setItem("sq_user", JSON.stringify(currentUser));
  closeModal("loginModal");
  updateAuthUI();
  showToast(`👋 Hola, <b>${currentUser.player}</b>! Ya podés tirar castigos.`);
  renderTable(); // re-render para mostrar botones de castigo
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem("sq_user");
  updateAuthUI();
  renderTable();
}

function updateAuthUI() {
  const loggedOut = document.getElementById("authLoggedOut");
  const loggedIn  = document.getElementById("authLoggedIn");
  if (currentUser) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    document.getElementById("navUserName").textContent = currentUser.player;
    document.getElementById("navUserInitial").textContent = currentUser.player[0].toUpperCase();
    updateNavCooldown();
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
  }
}

async function updateNavCooldown() {
  if (!currentUser) return;
  const record = await getSenderCooldown(currentUser.player);
  const badge  = document.getElementById("navCooldownBadge");
  const timer  = document.getElementById("navCooldownTimer");
  if (record) {
    const remaining = COOLDOWN_MS - (Date.now() - record.sentAt.getTime());
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    badge.classList.remove("hidden");
    timer.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  } else {
    badge.classList.add("hidden");
  }
}

/* ============================================================
   MODAL CASTIGO
   ============================================================ */
let punishTarget = null;
let selectedPunishment = null;
let activePunishments  = {};

function openPunishModal(player) {
  punishTarget = player;
  selectedPunishment = null;
  document.getElementById("punishTargetName").textContent   = player.summonerName;
  document.getElementById("punishTargetTag").textContent    = player.riotTag;
  document.getElementById("punishTargetAvatar").src         = player.avatar;
  document.getElementById("punishResultIcon").textContent   = "🎲";
  document.getElementById("punishResultName").textContent   = "Presiona «Sortear castigo» para elegir";
  document.getElementById("punishResultDesc").textContent   = "";
  document.getElementById("btnConfirmPunish").disabled      = true;
  openModal("punishModal");
}

function rollPunishment() {
  const p = PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
  selectedPunishment = p;
  document.getElementById("punishResultIcon").textContent = p.icon;
  document.getElementById("punishResultName").textContent = p.name;
  document.getElementById("punishResultDesc").textContent = p.desc;
  document.getElementById("btnConfirmPunish").disabled = false;
}

async function confirmPunishment() {
  if (!punishTarget || !selectedPunishment || !currentUser) return;

  const btn = document.getElementById("btnConfirmPunish");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  // Verificar cooldown del sender
  const senderCd = await getSenderCooldown(currentUser.player);
  if (senderCd) {
    closeModal("punishModal");
    showToast("⏳ Ya tiraste un castigo. Espera 6 horas para volver a tirar.", true);
    btn.disabled = false; btn.textContent = "Confirmar";
    return;
  }

  // Verificar cooldown del receiver
  const existing = activePunishments[punishTarget.summonerName];
  if (existing) {
    closeModal("punishModal");
    showToast(`⏳ ${punishTarget.summonerName} ya tiene un castigo activo.`, true);
    btn.disabled = false; btn.textContent = "Confirmar";
    return;
  }

  await savePunishment(punishTarget.summonerName, currentUser.player, selectedPunishment);
  activePunishments = await loadPunishments();

  closeModal("punishModal");
  showToast(`💥 ¡<b>${selectedPunishment.icon} ${selectedPunishment.name}</b> le llegó a ${punishTarget.summonerName}!`);
  updateNavCooldown();
  renderTable();
  btn.disabled = false; btn.textContent = "Confirmar";
}

function initPunishModal() {
  document.getElementById("btnClosePunish").addEventListener("click",  () => closeModal("punishModal"));
  document.getElementById("btnRerollPunish").addEventListener("click", rollPunishment);
  document.getElementById("btnConfirmPunish").addEventListener("click", confirmPunishment);
  document.getElementById("punishModal").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal("punishModal");
  });
}

/* ============================================================
   HELPERS modales y toast
   ============================================================ */
function openModal(id)  { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

let toastTimer = null;
function showToast(html, isError = false) {
  const el = document.getElementById("toast");
  el.innerHTML = html;
  el.style.borderColor = isError ? "rgba(255,77,109,0.4)" : "#2a2a35";
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

/* ============================================================
   DATOS RANKING
   ============================================================ */
const DATA_URL = "data/players.json";

const state = {
  players: [],
  updatedAt: null,
  tournamentEndsAt: null,
  filter: "todos",
  onlyLive: false,
  onlyInGame: false,
  search: "",
  sortKey: "lp",
  sortDir: "desc",
};

const TIER_ORDER = ["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];
const DIVISION_ORDER = { "IV":0,"III":1,"II":2,"I":3 };

function parseElo(eloStr) {
  if (!eloStr) return { tierIdx:-1, divisionIdx:-1, tierName:"" };
  const parts = eloStr.trim().split(/\s+/);
  const tierName = (parts[0]||"").toUpperCase();
  const divisionRoman = parts[1] || null;
  const tierIdx = TIER_ORDER.indexOf(tierName);
  const divisionIdx = divisionRoman && DIVISION_ORDER[divisionRoman] !== undefined ? DIVISION_ORDER[divisionRoman] : 4;
  return { tierIdx, divisionIdx, tierName };
}

function rankScore(p) {
  const { tierIdx, divisionIdx } = parseElo(p.elo);
  return (tierIdx+1)*100000 + divisionIdx*10000 + (p.lp||0);
}
function sortByRank(list) { return [...list].sort((a,b) => rankScore(b)-rankScore(a)); }

const RANK_TIERS = new Set(["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"]);
const RANK_EXTENSIONS = ["webp","png","jpg"];

function rankImg(size, cssClass, eloStr) {
  const { tierName } = parseElo(eloStr);
  if (!RANK_TIERS.has(tierName)) return `<span class="${cssClass} inline-block" style="width:${size}px;height:${size}px"></span>`;
  const key = tierName.toLowerCase();
  const label = tierName[0]+tierName.slice(1).toLowerCase();
  return `<img class="${cssClass}" width="${size}" height="${size}"
    src="assets/ranks/${key}.${RANK_EXTENSIONS[0]}" alt="${label}" title="${label}"
    onerror="this.src='assets/ranks/${key}.${RANK_EXTENSIONS[1]||'png'}'; this.onerror=function(){this.src='assets/ranks/${key}.${RANK_EXTENSIONS[2]||'jpg'}'; this.onerror=null;}"
    style="object-fit:contain">`;
}

const ROLE_KEYS = ["top","jungle","mid","adc","support"];
const ROLE_LABELS = { top:"Top",jungle:"Jungla",mid:"Mid",adc:"ADC",support:"Support" };

function roleIcon(role) {
  const key = (role||"").toLowerCase();
  if (!ROLE_KEYS.includes(key)) return `<span class="text-text-dimmer text-xs" title="Rol no definido">⚑</span>`;
  return `<img class="w-[22px] h-[22px] object-contain block" src="assets/roles/${key}.webp"
    alt="${ROLE_LABELS[key]}" title="${ROLE_LABELS[key]}"
    onerror="this.outerHTML='<span class=&quot;text-text-dimmer text-xs&quot;>⚑</span>'">`;
}

function sparkline(last20) {
  if (!last20||!last20.length) return "";
  const w=100,h=30,pad=3, step=(w-pad*2)/(last20.length-1);
  let cum=0;
  const pts=last20.map((v,i)=>{ cum+=v===1?1:-1; return {x:pad+i*step,y:cum}; });
  const maxAbs=Math.max(1,...pts.map(p=>Math.abs(p.y)));
  const scaled=pts.map(p=>({x:p.x,y:h/2-(p.y/maxAbs)*(h/2-pad)}));
  const d=scaled.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
  const color=scaled[scaled.length-1].y<scaled[0].y?"#34d67a":"#ff4d6d";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function winrate(p) { const t=p.wins+p.losses; return t?Math.round(p.wins/t*100):0; }
function countWL(arr,val){ return (arr||[]).filter(x=>x===val).length; }
function formatLP(n){ return n.toLocaleString("es-ES"); }
function pad2(n){ return n.toString().padStart(2,"0"); }

/* ============================================================
   COLUMNA CASTIGO — render
   ============================================================ */
function renderPunishmentCell(player) {
  const pname = player.summonerName;
  const record = activePunishments[pname];
  const isMe = currentUser && currentUser.player === pname;

  // Si el jugador tiene un castigo activo → mostrar icono con tooltip
  if (record) {
    const p = record.punishment;
    const remaining = COOLDOWN_MS - (Date.now() - new Date(record.sentAt).getTime());
    const h = Math.floor(remaining/3600000);
    const m = Math.floor((remaining%3600000)/60000);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return `
    <div class="punishment-wrap">
      <div class="flex items-center gap-1.5">
        <span class="text-2xl cursor-default">${p.icon}</span>
        <div class="cooldown-pill">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          ${timeStr}
        </div>
      </div>
      <div class="punishment-tooltip">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xl">${p.icon}</span>
          <span class="font-extrabold text-white text-sm">${p.name}</span>
        </div>
        <p class="text-text-dim text-xs leading-relaxed mb-2">${p.desc}</p>
        <div class="text-[10px] text-text-dimmer border-t border-[#2a2a35] pt-2 mt-1">
          Enviado por <span class="text-accent font-bold">${record.senderName}</span> · expira en ${timeStr}
        </div>
      </div>
    </div>`;
  }

  // Si no hay castigo: mostrar botón solo si hay usuario logueado y no es él mismo
  if (currentUser && !isMe) {
    return `
    <button class="punish-btn flex items-center gap-1.5 bg-panel border border-panel-border
      text-text-dim hover:border-loss/40 hover:text-loss font-bold text-[11px] px-2.5 py-1.5 rounded-lg transition-colors"
      data-player="${pname}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Castigar
    </button>`;
  }

  // Sin login o es el propio jugador
  return `<span class="text-text-dimmer text-xs">—</span>`;
}

/* ============================================================
   RENDER
   ============================================================ */
function renderUpdatedLine() {
  const el=document.getElementById("updatedAgo");
  const diffMin=Math.max(0,Math.round((Date.now()-state.updatedAt.getTime())/60000));
  if(diffMin<1) el.textContent="hace instantes";
  else if(diffMin<60) el.textContent=`hace ${diffMin} min`;
  else el.textContent=`hace ${Math.round(diffMin/60)} h`;
}

function startCountdown() {
  const el=document.getElementById("countdown");
  if(!state.tournamentEndsAt){ el.innerHTML="<span>Sin fecha configurada</span>"; return; }
  tick(); setInterval(tick,1000);
  function tick(){
    let diff=state.tournamentEndsAt.getTime()-Date.now(); if(diff<0)diff=0;
    const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),
          m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
    el.innerHTML=
      `<span>${d}</span><span class="text-[13px] font-semibold text-text-dim mr-2">d</span>`+
      `<span>${pad2(h)}</span><span class="text-[13px] font-semibold text-text-dim mr-2">h</span>`+
      `<span>${pad2(m)}</span><span class="text-[13px] font-semibold text-text-dim mr-2">m</span>`+
      `<span>${pad2(s)}</span><span class="text-[13px] font-semibold text-text-dim">s</span>`;
  }
}

function renderPodium() {
  const top3=sortByRank(state.players).slice(0,3);
  const medals=["👑","🥈","🥉"];
  const borderCls=["border-[rgba(255,201,61,.35)]","border-[rgba(201,204,209,.25)]","border-[rgba(215,139,76,.3)]"];
  document.getElementById("podium").innerHTML=top3.map((p,i)=>{
    const wr=winrate(p);
    return `
    <div class="relative bg-panel border ${borderCls[i]} rounded-2xl p-6">
      <div class="flex items-center gap-3 mb-7">
        <span class="text-xl w-6 text-center">${medals[i]}</span>
        <img class="w-10 h-10 rounded-full object-cover bg-[#23232a] border-2 border-[#2c2c33]" src="${p.avatar}" alt="${p.summonerName}" onerror="this.style.opacity=0">
        <div class="flex flex-col">
          <span class="font-extrabold text-[25px]">${p.summonerName}</span>
          <span class="text-sm italic text-text-dim">${p.riotTag}</span>
        </div>
        <div class="ml-auto w-6 h-6 rounded-md border border-panel-border flex items-center justify-center text-text-dimmer text-xs">✎</div>
      </div>
      <div class="flex items-center gap-3 mb-5">
        ${rankImg(46,"",p.elo)}
        <span class="text-[38px] font-black tracking-tight leading-none">${formatLP(p.lp)}<span class="text-base font-bold text-text-dim ml-1">LP</span></span>
      </div>
      <div class="flex justify-between gap-2 mb-3">
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${p.wins}W ${p.losses}L</b><span class="text-text-dim text-xs italic">${p.wins+p.losses} partidas</span></div>
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${wr}%</b><span class="text-text-dim text-xs italic">Winrate</span></div>
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${countWL(p.last20,1)}W ${countWL(p.last20,0)}L</b><span class="text-text-dim text-xs italic">Últimas 20</span></div>
      </div>
      <div class="wl-bar mt-1"><span class="bar-w" style="width:${wr}%"></span><span class="bar-l" style="width:${100-wr}%"></span></div>
    </div>`;
  }).join("");
}

function bindControls() {
  document.querySelectorAll("#eloTabs .tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll("#eloTabs .tab-btn").forEach(b=>{
        b.className="tab-btn bg-panel border border-panel-border text-text-dim font-bold text-[13px] px-4 py-2.5 rounded-lg hover:text-white transition-colors";
      });
      btn.className="tab-btn bg-white text-bg font-bold text-[13px] px-4 py-2.5 rounded-lg";
      state.filter=btn.dataset.filter; renderTable();
    });
  });
  document.getElementById("searchInput").addEventListener("input",e=>{ state.search=e.target.value.trim().toLowerCase(); renderTable(); });
  document.getElementById("liveToggle").addEventListener("click",e=>{ state.onlyLive=!state.onlyLive; e.currentTarget.classList.toggle("text-loss",state.onlyLive); renderTable(); });
  document.getElementById("ingameToggle").addEventListener("click",e=>{ state.onlyInGame=!state.onlyInGame; e.currentTarget.classList.toggle("text-loss",state.onlyInGame); renderTable(); });
  document.querySelectorAll("thead th[data-sort]").forEach(th=>{
    th.addEventListener("click",()=>{
      const key=th.dataset.sort;
      if(state.sortKey===key) state.sortDir=state.sortDir==="desc"?"asc":"desc";
      else { state.sortKey=key; state.sortDir="desc"; }
      document.querySelectorAll("thead th").forEach(h=>h.classList.remove("text-white"));
      th.classList.add("text-white");
      renderTable();
    });
  });

  // Delegación de eventos para botones "Castigar"
  document.getElementById("tableBody").addEventListener("click", e=>{
    const btn = e.target.closest(".punish-btn");
    if (!btn) return;
    const pname = btn.dataset.player;
    const player = state.players.find(p=>p.summonerName===pname);
    if (player) openPunishModal(player);
  });
}

function getFiltered() {
  let list=[...state.players];
  if(state.filter==="high") list=list.filter(p=>p.lp>=1800);
  if(state.filter==="low")  list=list.filter(p=>p.lp<1800);
  if(state.onlyLive)   list=list.filter(p=>p.live);
  if(state.onlyInGame) list=list.filter(p=>p.inGame);
  if(state.search) list=list.filter(p=>p.summonerName.toLowerCase().includes(state.search)||(p.riotTag||"").toLowerCase().includes(state.search));
  const dir=state.sortDir==="desc"?-1:1;
  list.sort((a,b)=>{
    switch(state.sortKey){
      case "lp":       return (rankScore(a)-rankScore(b))*dir;
      case "winrate":  return (winrate(a)-winrate(b))*dir;
      case "lpchange": return ((a.lpGain24h-a.lpLoss24h)-(b.lpGain24h-b.lpLoss24h))*dir;
      default:         return (rankScore(a)-rankScore(b))*dir*-1;
    }
  });
  return list;
}

function renderTable() {
  const list=getFiltered();
  const body=document.getElementById("tableBody");
  if(!list.length){ body.innerHTML=`<tr><td colspan="9" class="text-center py-16 text-text-dim">No hay jugadores que coincidan con el filtro.</td></tr>`; return; }
  const sortedByRank=sortByRank(state.players);
  body.innerHTML=list.map(p=>{
    const overallRank=sortedByRank.findIndex(x=>x.summonerName===p.summonerName)+1;
    const medal=overallRank===1?"👑":overallRank===2?"🥈":overallRank===3?"🥉":overallRank;
    const wr=winrate(p);
    const gain=p.lpGain24h??0, loss=p.lpLoss24h??0;
    return `
    <tr class="transition-colors duration-100">
      <td class="px-4 py-3 w-10 font-extrabold text-text-dim"><span class="text-[15px]">${medal}</span></td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2.5">
          <img class="w-8 h-8 rounded-full object-cover bg-[#23232a] border-2 border-[#2c2c33]" src="${p.avatar}" alt="" onerror="this.style.opacity=0">
          <div class="flex flex-col gap-px">
            <span class="font-extrabold text-[16px] flex items-center gap-1.5">
              ${p.summonerName}
              ${p.verified?'<span class="text-[13px] italic text-text-dimmer">✓</span>':""}
              ${p.live?'<span class="bg-accent text-bg text-[9px] font-black px-1.5 py-px rounded">● LIVE</span>':""}
            </span>
            <span class="text-[13px] text-text-dim">${p.riotTag}</span>
          </div>
        </div>
      </td>
      <td class="px-4 py-3"><div class="w-6 h-6 flex items-center justify-center">${roleIcon(p.role)}</div></td>
      <td class="px-4 py-3"><div class="flex items-center text-[16px] gap-2 font-extrabold whitespace-nowrap">${rankImg(20,"inline-block",p.elo)} ${formatLP(p.lp)} LP</div></td>
      <td class="px-4 py-3 min-w-[150px]">
        <div class="flex justify-between text-[11.5px] mb-1">
          <span class="text-win font-extrabold text-[16px]">${wr}%</span>
          <span class="text-text-dim text-[11.3px]">${p.wins}W · ${p.losses}D</span>
        </div>
        <div class="vd-bar"><span class="bar-w" style="width:${wr}%"></span><span class="bar-l" style="width:${100-wr}%"></span></div>
      </td>
      <td class="px-4 py-3">${sparkline(p.last20)}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-[12.5px]">
        <span class="text-win">▲ ${gain}</span><span class="text-loss ml-2">▼ ${loss}</span>
      </td>
      <td class="px-4 py-3">${renderPunishmentCell(p)}</td>
      <td class="px-4 py-3">
        <a class="inline-block bg-[#1b1b20] border border-panel-border text-text-dim font-extrabold text-[11px] px-3 py-1.5 rounded-md no-underline hover:opacity-80 transition-opacity ${p.live?"!bg-accent !text-bg !border-accent":""}"
          href="${p.opggUrl}" target="_blank" rel="noopener">OP.GG</a>
      </td>
    </tr>`;
  }).join("");
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  initFirebase();
  authInit();
  initPunishModal();

  try {
    const res=await fetch(DATA_URL,{cache:"no-store"});
    if(!res.ok) throw new Error("No se pudo cargar "+DATA_URL);
    const json=await res.json();
    state.players=json.players||[];
    state.updatedAt=json.updatedAt?new Date(json.updatedAt):new Date();
    state.tournamentEndsAt=json.tournamentEndsAt?new Date(json.tournamentEndsAt):null;
  } catch(err) {
    console.error(err);
    document.getElementById("tableBody").innerHTML=`<tr><td colspan="9" class="text-center py-16 text-text-dim">No se pudo cargar data/players.json.</td></tr>`;
    return;
  }

  // Cargar castigos activos
  activePunishments = await loadPunishments();

  renderUpdatedLine();
  startCountdown();
  renderPodium();
  renderTable();
  bindControls();

  // Refresh de castigos cada 30s
  setInterval(async () => {
    activePunishments = await loadPunishments();
    updateNavCooldown();
    renderTable();
  }, 30000);

  // Cooldown timer en navbar cada minuto
  setInterval(updateNavCooldown, 60000);
}

init();
