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
  const PUNISHMENTS = [
  {
    id: 1,
    icon: "assets/punishments/clown.webp",
    name: "El Antiflash",
    desc: "Tienes prohibido seleccionar el hechizo Destello (Flash)."
  },
  {
    id: 2,
    icon: "assets/punishments/silencio.webp",
    name: "Banea2 de la Grieta",
    desc: "Tienes baneados tus 3 campeones más jugados de la temporada"
  },
  {
    id: 3,
    icon: "assets/punishments/slow-motion.webp",
    name: "Ruleta Rusa de Riot",
    desc: "Jugar solo con objetos de movimiento, sin daño por 1 partida."
  },
  {
    id: 4,
    icon: "assets/punishments/mid-feed.webp",
    name: "Sin Ganas de Vivir",
    desc: " No puedes comprar ningún tipo de botas en toda la partida. Tampoco vale llevar la runa de Calzado Mágico."
  },
  {
    id: 5,
    icon: "assets/punishments/no-map.webp",
    name: "Masoquista del Parche",
    desc: "Busca en OP.GG o U.GG el campeón con el Winrate más bajo para jugarlo la próxima partida."
  },
  {
    id: 6,
    icon: "assets/punishments/support.webp",
    name: "Pantalla de Microondas",
    desc: "Entra a los ajustes visuales y reduce el mapa y la interfaz (HUD) al 0%."
  },
  {
    id: 7,
    icon: "assets/punishments/gastador.webp",
    name: "El sin Vida",
    desc: "Tienes estrictamente prohibido comprar pociones de vida, de reutilización o galletas al inicio y durante toda la partida."
  },
  {
    id: 8,
    icon: "assets/punishments/pato.webp",
    name: "Runa Clasicarda",
    desc: "No puedes equiparte la runa clave principal de tu campeón."
  }
];
];

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas

/* ============================================================
   FIREBASE — inicialización (Firestore + Auth para el admin)
   ============================================================ */
let db = null;
let auth = null;

function initFirebase() {
  try {
    if (typeof FIREBASE_CONFIG === "undefined") throw new Error("firebase.js no encontrado");
    if (FIREBASE_CONFIG.apiKey === "TU_API_KEY") {
      console.warn("⚠️  Firebase no configurado. Los castigos no se guardarán entre sesiones.");
      return false;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    if (firebase.auth) auth = firebase.auth();
    return true;
  } catch(e) {
    console.warn("Firebase no disponible:", e.message);
    return false;
  }
}

/* ============================================================
   CASTIGOS — modelo de datos
   Cada doc (ID = targetName, así solo hay 1 castigo por persona):
   {
     targetName, senderName, punishment,
     sentAt: cuándo se sorteó y se aplicó el castigo. El castigo es
             OBLIGATORIO: no hay confirmación del que lo recibe, el
             timer de 6 horas arranca en el mismo instante en que
             termina la ruleta.
   }
   ============================================================ */

/* Cache local (fallback si Firebase no está configurado) */
let localPunishments = {}; // { targetName: { punishment, senderName, sentAt } }

function isPunishmentEffective(r, now) {
  if (!r || !r.sentAt) return false;
  return (now - r.sentAt.getTime()) < COOLDOWN_MS; // sigue activo mientras no pasen 6h
}

async function loadPunishments() {
  const now = Date.now();
  if (!db) {
    const result = {};
    for (const [target, r] of Object.entries(localPunishments)) {
      if (isPunishmentEffective(r, now)) result[target] = r;
    }
    return result;
  }
  try {
    // Traemos toda la colección: es chica (1 doc por jugador activo) y así
    // evitamos tener que crear índices compuestos en Firestore.
    const snap = await db.collection("punishments").get();
    const result = {};
    snap.forEach(doc => {
      const d = doc.data();
      const r = {
        punishment: d.punishment,
        senderName: d.senderName,
        sentAt: d.sentAt ? d.sentAt.toDate() : null,
      };
      if (isPunishmentEffective(r, now)) result[d.targetName] = r;
    });
    return result;
  } catch(e) {
    console.error("Error cargando castigos:", e);
    return localPunishments;
  }
}

/* El castigo se guarda ya APLICADO: no requiere confirmación de nadie,
   el que lo recibe está obligado a cumplirlo y el timer de 6h arranca ya. */
async function savePunishment(targetName, senderName, punishment) {
  const record = { punishment, senderName, sentAt: new Date() };
  localPunishments[targetName] = record;
  if (!db) return;
  try {
    // Usa targetName como doc ID para que solo haya un castigo activo por persona.
    // set() sobrescribe cualquier castigo viejo/expirado que hubiera para ese target.
    await db.collection("punishments").doc(targetName).set({
      targetName, senderName,
      punishment,
      sentAt: firebase.firestore.Timestamp.fromDate(record.sentAt),
    });
  } catch(e) {
    console.error("Error guardando castigo:", e);
    showToast("❌ No se pudo guardar el castigo. Intenta de nuevo.", true);
  }
}

async function getSenderCooldown(senderName) {
  if (!db) {
    // En local: buscar si este sender tiene algún castigo reciente
    return Object.values(localPunishments).find(
      r => r.senderName === senderName && r.sentAt && (Date.now() - r.sentAt.getTime()) < COOLDOWN_MS
    ) || null;
  }
  try {
    // Consulta simple por igualdad (no requiere índice compuesto).
    const snap = await db.collection("punishments")
      .where("senderName", "==", senderName)
      .get();
    let latest = null;
    snap.forEach(doc => {
      const d = doc.data();
      if (!d.sentAt) return;
      const sentAt = d.sentAt.toDate();
      if ((Date.now() - sentAt.getTime()) < COOLDOWN_MS) {
        if (!latest || sentAt > latest) latest = sentAt;
      }
    });
    return latest ? { sentAt: latest } : null;
  } catch(e) {
    console.error("Error verificando cooldown:", e);
    return null;
  }
}

/* ============================================================
   ADMIN — reset de todos los castigos
   Protegido por Firebase Authentication + reglas de Firestore
   (ver SETUP_CASTIGOS.md). El botón solo aparece si currentUser.isAdmin.
   ============================================================ */
async function resetAllPunishments() {
  if (!currentUser || !currentUser.isAdmin) return false;
  localPunishments = {};
  if (!db) return true;
  try {
    const snap = await db.collection("punishments").get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return true;
  } catch(e) {
    console.error("Error reseteando castigos:", e);
    showToast("❌ No se pudo resetear. ¿Tu cuenta admin tiene permiso en las reglas de Firestore?", true);
    return false;
  }
}

/* ============================================================
   AUTH — login simple de jugadores + login de admin (Firebase Auth)
   ============================================================ */
let currentUser = null; // { player: "X1no" } o { player:"Admin", isAdmin:true, email }

function authInit() {
  // Cargar sesión de JUGADOR guardada (login simple, no es Firebase Auth)
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

  // --- Toggle entre login de jugador y login de admin ---
  document.getElementById("btnShowAdminLogin").addEventListener("click", () => {
    document.getElementById("playerLoginFields").classList.add("hidden");
    document.getElementById("adminLoginFields").classList.remove("hidden");
  });
  document.getElementById("btnShowPlayerLogin").addEventListener("click", () => {
    document.getElementById("adminLoginFields").classList.add("hidden");
    document.getElementById("playerLoginFields").classList.remove("hidden");
  });
  document.getElementById("adminPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") doAdminLogin();
  });
  document.getElementById("btnAdminLogin").addEventListener("click", doAdminLogin);

  // --- Botón de reset (solo visible para admin) ---
  document.getElementById("btnResetCastigos").addEventListener("click", doResetCastigos);

  // Restaurar sesión de ADMIN si Firebase Auth ya tiene una sesión activa
  // (Firebase Auth persiste la sesión sola, por eso no usamos sessionStorage acá)
  if (auth) {
    auth.onAuthStateChanged(user => {
      if (user) {
        currentUser = { player: "Admin", isAdmin: true, email: user.email };
        sessionStorage.removeItem("sq_user"); // el admin no es un jugador
        updateAuthUI();
        renderTable();
      } else if (currentUser && currentUser.isAdmin) {
        currentUser = null;
        updateAuthUI();
        renderTable();
      }
    });
  }
}

function doLogin() {
  const player = document.getElementById("loginPlayer").value;
  const pwd    = document.getElementById("loginPassword").value;
  const errEl  = document.getElementById("loginError");

  if (!player) { errEl.textContent = "Seleccioná tu jugador."; errEl.classList.remove("hidden"); return; }

  const users = typeof USERS !== "undefined" ? USERS : [];
  const match = users.find(u => u.player === player && u.password === pwd);

  if (!match) {
    errEl.textContent = "Contraseña incorrecta. Intentá de nuevo.";
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

async function doAdminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const pwd   = document.getElementById("adminPassword").value;
  const errEl = document.getElementById("loginError");

  if (!auth) {
    errEl.textContent = "Firebase Auth no está configurado (ver SETUP_CASTIGOS.md).";
    errEl.classList.remove("hidden");
    return;
  }
  if (!email || !pwd) {
    errEl.textContent = "Completá el correo y la contraseña de admin.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("btnAdminLogin");
  btn.disabled = true; btn.textContent = "Verificando…";
  try {
    await auth.signInWithEmailAndPassword(email, pwd);
    errEl.classList.add("hidden");
    closeModal("loginModal");
    showToast("🔑 Sesión de administrador iniciada.");
    // updateAuthUI() y renderTable() se disparan solos vía onAuthStateChanged
  } catch(e) {
    errEl.textContent = "Credenciales de admin incorrectas.";
    errEl.classList.remove("hidden");
    const modal = document.querySelector("#loginModal > div");
    modal.classList.add("shake");
    setTimeout(() => modal.classList.remove("shake"), 400);
  } finally {
    btn.disabled = false; btn.textContent = "Entrar como admin";
  }
}

function logout() {
  const wasAdmin = currentUser && currentUser.isAdmin;
  currentUser = null;
  sessionStorage.removeItem("sq_user");
  if (wasAdmin && auth) auth.signOut();
  updateAuthUI();
  renderTable();
}

function updateAuthUI() {
  const loggedOut = document.getElementById("authLoggedOut");
  const loggedIn  = document.getElementById("authLoggedIn");
  const resetBtn  = document.getElementById("btnResetCastigos");
  if (currentUser) {
    loggedOut.classList.add("hidden");
    loggedIn.classList.remove("hidden");
    document.getElementById("navUserName").textContent = currentUser.isAdmin ? "Admin" : currentUser.player;
    document.getElementById("navUserInitial").textContent = (currentUser.isAdmin ? "A" : currentUser.player[0]).toUpperCase();
    resetBtn.classList.toggle("hidden", !currentUser.isAdmin);
    updateNavCooldown();
  } else {
    loggedOut.classList.remove("hidden");
    loggedIn.classList.add("hidden");
    resetBtn.classList.add("hidden");
  }
}

async function doResetCastigos() {
  if (!currentUser || !currentUser.isAdmin) return;
  const ok = window.confirm("¿Seguro que querés borrar TODOS los castigos activos de todos los jugadores? Esta acción no se puede deshacer.");
  if (!ok) return;

  const btn = document.getElementById("btnResetCastigos");
  btn.disabled = true; btn.textContent = "Reseteando…";
  const success = await resetAllPunishments();
  btn.disabled = false; btn.textContent = "🗑️ Resetear castigos";

  if (success) {
    activePunishments = {};
    showToast("🧹 Todos los castigos fueron reseteados.");
    renderTable();
  }
}

async function updateNavCooldown() {
  if (!currentUser || currentUser.isAdmin) {
    document.getElementById("navCooldownBadge").classList.add("hidden");
    return;
  }
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

let punishRouletteTimer = null; // setTimeout activo de la ruleta (para poder cancelarlo)

function openPunishModal(player) {
  if (!currentUser || currentUser.isAdmin) return; // el admin no juega, no tira castigos
  if (punishRouletteTimer) { clearTimeout(punishRouletteTimer); punishRouletteTimer = null; }

  punishTarget = player;
  selectedPunishment = null;
  document.getElementById("punishTargetName").textContent   = player.summonerName;
  document.getElementById("punishTargetTag").textContent    = player.riotTag;
  document.getElementById("punishTargetAvatar").src         = player.avatar;
  document.getElementById("punishResultIcon").textContent   = "🎲";
  document.getElementById("punishResultName").textContent   = "Presiona «Tirar castigo» para sortear";
  document.getElementById("punishResultDesc").textContent   = "";

  const btnRoll = document.getElementById("btnRerollPunish");
  btnRoll.disabled = false;
  btnRoll.textContent = "🎲 Tirar castigo";

  const btnClose = document.getElementById("btnClosePunish");
  btnClose.disabled = false;
  btnClose.classList.remove("opacity-30", "pointer-events-none");

  openModal("punishModal");
}

/* Verifica cooldowns y, si está todo OK, arranca la animación de ruleta.
   El castigo es obligatorio: una vez que arranca la ruleta ya no se puede
   cancelar ni cerrar el modal, y al terminar se aplica solo, sin que nadie
   tenga que confirmarlo. */
async function beginPunishRoulette() {
  if (!punishTarget || !currentUser) return;

  const btnRoll  = document.getElementById("btnRerollPunish");
  const btnClose = document.getElementById("btnClosePunish");
  btnRoll.disabled = true;
  btnRoll.textContent = "Verificando…";

  const senderCd = await getSenderCooldown(currentUser.player);
  if (senderCd) {
    closeModal("punishModal");
    showToast("⏳ Ya tiraste un castigo. Espera 6 horas para volver a tirar.", true);
    return;
  }

  const existing = activePunishments[punishTarget.summonerName];
  if (existing) {
    closeModal("punishModal");
    showToast(`⏳ ${punishTarget.summonerName} ya tiene un castigo activo.`, true);
    return;
  }

  // A partir de acá el castigo va sí o sí: se bloquea el cierre del modal.
  btnClose.disabled = true;
  btnClose.classList.add("opacity-30", "pointer-events-none");
  btnRoll.textContent = "🎰 Sorteando…";

  runRouletteAnimation();
}

/* Animación tipo ruleta: 10 segundos mostrando castigos al azar, cada vez
   más lento hacia el final, hasta que se frena en el castigo definitivo. */
function runRouletteAnimation() {
  const iconEl = document.getElementById("punishResultIcon");
  const nameEl = document.getElementById("punishResultName");
  const descEl = document.getElementById("punishResultDesc");
  descEl.textContent = "Sorteando entre todos los castigos…";

  const TOTAL_MS = 10000;
  const start = Date.now();

  function spin() {
    const elapsed = Date.now() - start;
    const p = PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
    iconEl.textContent = p.icon;
    nameEl.textContent = p.name;

    if (elapsed >= TOTAL_MS) {
      landPunishment();
      return;
    }
    // Se va frenando hacia el final, como una ruleta real.
    const delay = elapsed > TOTAL_MS - 2500 ? 200
                : elapsed > TOTAL_MS - 5000 ? 120
                : 70;
    punishRouletteTimer = setTimeout(spin, delay);
  }

  spin();
}

/* Se elige el castigo final, se guarda ya como aplicado (obligatorio,
   sin confirmación) y arranca el timer de 6 horas del receptor. */
async function landPunishment() {
  punishRouletteTimer = null;
  const final = PUNISHMENTS[Math.floor(Math.random() * PUNISHMENTS.length)];
  selectedPunishment = final;

  document.getElementById("punishResultIcon").textContent = final.icon;
  document.getElementById("punishResultName").textContent = final.name;
  document.getElementById("punishResultDesc").textContent = final.desc;

  await savePunishment(punishTarget.summonerName, currentUser.player, final);
  activePunishments = await loadPunishments();

  showToast(`💥 ¡<b>${final.icon} ${final.name}</b> le tocó a ${punishTarget.summonerName}! Ya está activo por 6 horas.`);
  updateNavCooldown();
  renderTable();

  const btnRoll  = document.getElementById("btnRerollPunish");
  const btnClose = document.getElementById("btnClosePunish");
  btnRoll.disabled = true;
  btnRoll.textContent = "✅ Castigo aplicado";
  btnClose.disabled = false;
  btnClose.classList.remove("opacity-30", "pointer-events-none");

  setTimeout(() => closeModal("punishModal"), 1600);
}

function initPunishModal() {
  document.getElementById("btnClosePunish").addEventListener("click", () => {
    if (document.getElementById("btnClosePunish").disabled) return;
    closeModal("punishModal");
  });
  document.getElementById("btnRerollPunish").addEventListener("click", beginPunishRoulette);
  document.getElementById("punishModal").addEventListener("click", e => {
    if (e.target !== e.currentTarget) return;
    if (document.getElementById("btnClosePunish").disabled) return;
    closeModal("punishModal");
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
  const isMe = currentUser && !currentUser.isAdmin && currentUser.player === pname;

  if (record) {
    const p = record.punishment;

    // El castigo se aplica al instante (obligatorio, sin confirmación):
    // el timer de 6h corre desde que se sorteó.
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
          <span class="text-[15px]">${p.icon}</span>
          <span class="font-extrabold text-white text-sm">${p.name}</span>
        </div>
        <p class="text-text-dim text-[15px] leading-relaxed mb-2">${p.desc}</p>
        <div class="text-[15px] text-text-dimmer border-t border-[#2a2a35] pt-2 mt-1">
          Enviado por <span class="text-accent font-bold">${record.senderName}</span> · expira en ${timeStr}
        </div>
      </div>
    </div>`;
  }

  // Si no hay castigo: mostrar botón solo si hay un jugador logueado (no admin) y no es él mismo
  if (currentUser && !currentUser.isAdmin && !isMe) {
    return `
    <button class="punish-btn flex items-center gap-1.5 bg-panel border border-panel-border
      text-text-dim hover:border-loss/40 hover:text-loss font-bold text-[15px] px-2.5 py-1.5 rounded-lg transition-colors"
      data-player="${pname}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Castigar
    </button>`;
  }

  // Sin login, admin, o es el propio jugador
  return `<span class="text-text-dimmer text-[15px]">—</span>`;
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
    <div class="relative backdrop-blur-lg bg-black/15 border ${borderCls[i]} rounded-2xl p-6">
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

  initPunishmentTooltips();
}

/* ============================================================
   TOOLTIP DE CASTIGO — posicionado con JS (position:fixed) para
   que nunca quede recortado por el overflow del contenedor de la
   tabla, y para que siempre se vea completo aunque esté cerca del
   borde de la pantalla.
   ============================================================ */
function initPunishmentTooltips() {
  const tableBody = document.getElementById("tableBody");

  tableBody.addEventListener("mouseover", e => {
    const wrap = e.target.closest(".punishment-wrap");
    if (!wrap) return;
    showPunishmentTooltip(wrap);
  });

  tableBody.addEventListener("mouseout", e => {
    const wrap = e.target.closest(".punishment-wrap");
    if (!wrap) return;
    if (wrap.contains(e.relatedTarget)) return; // seguimos dentro del mismo wrap
    hidePunishmentTooltip(wrap);
  });

  // Si se hace scroll en la tabla (o en la ventana), ocultamos cualquier
  // tooltip abierto para que no quede flotando en una posición vieja.
  const scrollContainer = document.querySelector(".table-scroll");
  const hideAll = () => document.querySelectorAll(".punishment-tooltip").forEach(t => t.style.display = "none");
  if (scrollContainer) scrollContainer.addEventListener("scroll", hideAll);
  window.addEventListener("scroll", hideAll, true);
}

function showPunishmentTooltip(wrap) {
  const tooltip = wrap.querySelector(".punishment-tooltip");
  if (!tooltip) return;

  tooltip.style.display = "block";
  tooltip.classList.remove("tooltip-above", "tooltip-below");

  const margin = 10;
  const wrapRect = wrap.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  // Vertical: preferimos arriba del ícono; si no entra, la mostramos abajo.
  let top;
  if (wrapRect.top - ttRect.height - margin > 0) {
    top = wrapRect.top - ttRect.height - margin;
    tooltip.classList.add("tooltip-above");
  } else {
    top = wrapRect.bottom + margin;
    tooltip.classList.add("tooltip-below");
  }

  // Horizontal: centrada en el ícono, pero sin salirse de la pantalla.
  let left = wrapRect.left + wrapRect.width / 2 - ttRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - ttRect.width - margin));

  tooltip.style.top  = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function hidePunishmentTooltip(wrap) {
  const tooltip = wrap.querySelector(".punishment-tooltip");
  if (tooltip) tooltip.style.display = "none";
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
