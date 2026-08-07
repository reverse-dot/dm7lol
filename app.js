/* ==========================================================
   SoloQ Challenge Ranking — app.js
   Lee data/players.json y pinta toda la UI.
   Rangos: imágenes locales en assets/ranks/{tier}.webp
   ========================================================== */

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

const SHELL_ICONS = { skull:"💀", flame:"🔥", clock:"🕒", trophy:"🏆" };

/* ---- Orden de tiers ---- */
const TIER_ORDER = [
  "IRON","BRONZE","SILVER","GOLD","PLATINUM",
  "EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER",
];
const DIVISION_ORDER = { "IV":0, "III":1, "II":2, "I":3 };

function parseElo(eloStr) {
  if (!eloStr) return { tierIdx:-1, divisionIdx:-1, tierName:"" };
  const parts = eloStr.trim().split(/\s+/);
  const tierName = (parts[0]||"").toUpperCase();
  const divisionRoman = parts[1] || null;
  const tierIdx = TIER_ORDER.indexOf(tierName);
  const divisionIdx = divisionRoman && DIVISION_ORDER[divisionRoman] !== undefined
    ? DIVISION_ORDER[divisionRoman] : 4;
  return { tierIdx, divisionIdx, tierName };
}

function rankScore(p) {
  const { tierIdx, divisionIdx } = parseElo(p.elo);
  return (tierIdx+1)*100000 + divisionIdx*10000 + (p.lp||0);
}

function sortByRank(list) {
  return [...list].sort((a,b) => rankScore(b) - rankScore(a));
}

/* ---- Imagen de rango LOCAL ----
   Coloca las imágenes en: assets/ranks/
   Nombres esperados (en minúsculas, cualquier extensión):
     iron.webp, bronze.webp, silver.webp, gold.webp,
     platinum.webp, emerald.webp, diamond.webp,
     master.webp, grandmaster.webp, challenger.webp
*/
const RANK_TIERS = new Set([
  "IRON","BRONZE","SILVER","GOLD","PLATINUM",
  "EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER",
]);

// Extensiones a intentar en orden (cambia según los archivos que descargues)
const RANK_EXTENSIONS = ["webp","png","jpg"];

function rankImg(size, cssClass, eloStr) {
  const { tierName } = parseElo(eloStr);
  if (!RANK_TIERS.has(tierName)) {
    return `<span class="${cssClass} inline-block" style="width:${size}px;height:${size}px"></span>`;
  }
  const key = tierName.toLowerCase();
  const label = tierName[0] + tierName.slice(1).toLowerCase();
  // Intenta webp primero; si falla, onerror lo sustituye con la siguiente extensión.
  // Para simplicidad, si tienes todos como .webp basta con la primera.
  return `<img class="${cssClass}" width="${size}" height="${size}"
    src="assets/ranks/${key}.${RANK_EXTENSIONS[0]}"
    alt="${label}" title="${label}"
    onerror="this.src='assets/ranks/${key}.${RANK_EXTENSIONS[1]||'png'}'; this.onerror=function(){this.src='assets/ranks/${key}.${RANK_EXTENSIONS[2]||'jpg'}'; this.onerror=null;}"
    style="object-fit:contain">`;
}

/* ---- Roles ---- */
const ROLE_KEYS = ["top","jungle","mid","adc","support"];
const ROLE_LABELS = { top:"Top", jungle:"Jungla", mid:"Mid", adc:"ADC", support:"Support" };

function roleIcon(role) {
  const key = (role||"").toLowerCase();
  if (!ROLE_KEYS.includes(key)) return `<span class="text-text-dimmer text-xs" title="Rol no definido">⚑</span>`;
  return `<img class="w-[22px] h-[22px] object-contain block"
    src="assets/roles/${key}.webp" alt="${ROLE_LABELS[key]}" title="${ROLE_LABELS[key]}"
    onerror="this.outerHTML='<span class=&quot;text-text-dimmer text-xs&quot;>⚑</span>'">`;
}

/* ---- Sparkline ---- */
function sparkline(last20) {
  if (!last20||!last20.length) return "";
  const w=100, h=30, pad=3;
  const step = (w-pad*2)/(last20.length-1);
  let cum=0;
  const pts = last20.map((v,i)=>{ cum += v===1?1:-1; return {x:pad+i*step,y:cum}; });
  const maxAbs = Math.max(1,...pts.map(p=>Math.abs(p.y)));
  const scaled = pts.map(p=>({x:p.x, y: h/2-(p.y/maxAbs)*(h/2-pad)}));
  const d = scaled.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
  const trendUp = scaled[scaled.length-1].y < scaled[0].y;
  const color = trendUp?"#34d67a":"#ff4d6d";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---- Helpers ---- */
function winrate(p) { const t=p.wins+p.losses; return t?Math.round(p.wins/t*100):0; }
function countWL(arr,val){ return (arr||[]).filter(x=>x===val).length; }
function formatLP(n){ return n.toLocaleString("es-ES"); }
function pad(n){ return n.toString().padStart(2,"0"); }

/* ---- INIT ---- */
init();

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache:"no-store" });
    if (!res.ok) throw new Error("No se pudo cargar "+DATA_URL);
    const json = await res.json();
    state.players = json.players||[];
    state.updatedAt = json.updatedAt ? new Date(json.updatedAt) : new Date();
    state.tournamentEndsAt = json.tournamentEndsAt ? new Date(json.tournamentEndsAt) : null;
  } catch(err) {
    console.error(err);
    document.getElementById("tableBody").innerHTML =
      `<tr><td colspan="9" class="text-center py-16 text-text-dim">
        No se pudo cargar data/players.json.<br>
        Revisá que el archivo exista o ejecutá scripts/update-data.js.
      </td></tr>`;
    return;
  }
  renderUpdatedLine();
  startCountdown();
  renderPodium();
  renderTable();
  bindControls();
}

/* ---- Header ---- */
function renderUpdatedLine() {
  const el = document.getElementById("updatedAgo");
  const diffMin = Math.max(0, Math.round((Date.now()-state.updatedAt.getTime())/60000));
  if (diffMin<1) el.textContent="hace instantes";
  else if (diffMin<60) el.textContent=`hace ${diffMin} min`;
  else el.textContent=`hace ${Math.round(diffMin/60)} h`;
}

function startCountdown() {
  const el = document.getElementById("countdown");
  if (!state.tournamentEndsAt) { el.innerHTML="<span>Sin fecha configurada</span>"; return; }
  tick(); setInterval(tick,1000);
  function tick(){
    let diff = state.tournamentEndsAt.getTime()-Date.now(); if(diff<0)diff=0;
    const d=Math.floor(diff/86400000), h=Math.floor((diff%86400000)/3600000),
          m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
    el.innerHTML=
      `<span>${d}</span><span class="text-[13px] font-semibold text-text-dim mr-2">d</span>`+
      `<span>${pad(h)}</span><span class="text-[13px] font-semibold text-text-dim mr-2">h</span>`+
      `<span>${pad(m)}</span><span class="text-[13px] font-semibold text-text-dim mr-2">m</span>`+
      `<span>${pad(s)}</span><span class="text-[13px] font-semibold text-text-dim">s</span>`;
  }
}

/* ---- Podium ---- */
function renderPodium() {
  const top3 = sortByRank(state.players).slice(0,3);
  const medals=["👑","🥈","🥉"];
  const borderCls=["border-[rgba(255,201,61,.35)]","border-[rgba(201,204,209,.25)]","border-[rgba(215,139,76,.3)]"];
  document.getElementById("podium").innerHTML = top3.map((p,i)=>{
    const wr=winrate(p);
    return `
    <div class="relative bg-panel border ${borderCls[i]} rounded-2xl p-6">
      <div class="flex items-center gap-3 mb-7">
        <span class="text-xl w-6 text-center">${medals[i]}</span>
        <img class="w-10 h-10 rounded-full object-cover bg-[#23232a] border-2 border-[#2c2c33]"
          src="${p.avatar}" alt="${p.summonerName}" onerror="this.style.opacity=0">
        <div class="flex flex-col">
          <span class="font-extrabold text-[25px]">${p.summonerName}</span>
          <span class="text-sm italic text-text-dim">${p.riotTag}</span>
        </div>
        <div class="ml-auto w-6 h-6 rounded-md border border-panel-border flex items-center justify-center text-text-dimmer text-xs">✎</div>
      </div>
      <div class="flex items-center gap-3 mb-5">
        ${rankImg(46,"",p.elo)}
        <span class="text-[38px] font-black tracking-tight leading-none">
          ${formatLP(p.lp)}<span class="text-base font-bold text-text-dim ml-1">LP</span>
        </span>
      </div>
      <div class="flex justify-between gap-2 mb-3">
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${p.wins}W ${p.losses}L</b><span class="text-text-dim text-xs !italic">${p.wins+p.losses} partidas</span></div>
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${wr}%</b><span class="text-text-dim text-xs !italic">Winrate</span></div>
        <div class="text-[13px]"><b class="block text-[18px] font-extrabold">${countWL(p.last20,1)}W ${countWL(p.last20,0)}L</b><span class="text-text-dim text-xs !italic">Últimas 20</span></div>
      </div>
      <div class="wl-bar mt-1">
        <span class="bar-w" style="width:${wr}%"></span>
        <span class="bar-l" style="width:${100-wr}%"></span>
      </div>
    </div>`;
  }).join("");
}

/* ---- Table ---- */
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

  document.getElementById("searchInput").addEventListener("input",e=>{
    state.search=e.target.value.trim().toLowerCase(); renderTable();
  });

  document.getElementById("liveToggle").addEventListener("click",e=>{
    state.onlyLive=!state.onlyLive;
    e.currentTarget.classList.toggle("text-loss",state.onlyLive);
    renderTable();
  });

  document.getElementById("ingameToggle").addEventListener("click",e=>{
    state.onlyInGame=!state.onlyInGame;
    e.currentTarget.classList.toggle("text-loss",state.onlyInGame);
    renderTable();
  });

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
}

function getFiltered() {
  let list=[...state.players];
  if(state.filter==="high") list=list.filter(p=>p.lp>=1800);
  if(state.filter==="low")  list=list.filter(p=>p.lp<1800);
  if(state.onlyLive)   list=list.filter(p=>p.live);
  if(state.onlyInGame) list=list.filter(p=>p.inGame);
  if(state.search) list=list.filter(p=>
    p.summonerName.toLowerCase().includes(state.search)||
    (p.riotTag||"").toLowerCase().includes(state.search));
  const dir=state.sortDir==="desc"?-1:1;
  list.sort((a,b)=>{
    switch(state.sortKey){
      case "lp":       return (rankScore(a)-rankScore(b))*dir;
      case "winrate":  return (winrate(a)-winrate(b))*dir;
      case "lpchange": return ((a.lpGain24h-a.lpLoss24h)-(b.lpGain24h-b.lpLoss24h))*dir;
      case "rank":
      default:         return (rankScore(a)-rankScore(b))*dir*-1;
    }
  });
  return list;
}

function renderTable() {
  const list=getFiltered();
  const body=document.getElementById("tableBody");
  if(!list.length){
    body.innerHTML=`<tr><td colspan="9" class="text-center py-16 text-text-dim">No hay jugadores que coincidan con el filtro.</td></tr>`;
    return;
  }
  const sortedByRank=sortByRank(state.players);
  body.innerHTML=list.map(p=>{
    const overallRank=sortedByRank.findIndex(x=>x.summonerName===p.summonerName)+1;
    const medal=overallRank===1?"👑":overallRank===2?"🥈":overallRank===3?"🥉":overallRank;
    const wr=winrate(p);
    const gain=p.lpGain24h??0, loss=p.lpLoss24h??0;
    return `
    <tr class="transition-colors duration-100">
      <td class="px-4 py-3 w-10 font-extrabold text-text-dim">
        <span class="text-[15px]">${medal}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2.5">
          <img class="w-8 h-8 rounded-full object-cover bg-[#23232a] border-2 border-[#2c2c33]"
            src="${p.avatar}" alt="" onerror="this.style.opacity=0">
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
      <td class="px-4 py-3">
        <div class="w-6 h-6 flex items-center justify-center">${roleIcon(p.role)}</div>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center text-[16px] gap-2 font-extrabold whitespace-nowrap">
          ${rankImg(20,"inline-block",p.elo)} ${formatLP(p.lp)} LP
        </div>
      </td>
      <td class="px-4 py-3 min-w-[150px]">
        <div class="flex justify-between text-[11.5px] mb-1">
          <span class="text-win font-extrabold text-[16px]">${wr}%</span>
          <span class="text-text-dim text-[11.3px]">${p.wins}W · ${p.losses}D</span>
        </div>
        <div class="vd-bar">
          <span class="bar-w" style="width:${wr}%"></span>
          <span class="bar-l" style="width:${100-wr}%"></span>
        </div>
      </td>
      <td class="px-4 py-3">${sparkline(p.last20)}</td>
      <td class="px-4 py-3 whitespace-nowrap font-bold text-[12.5px]">
        <span class="text-win">▲ ${gain}</span>
        <span class="text-loss ml-2">▼ ${loss}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          ${(p.shells||[]).map(s=>`<span class="flex items-center gap-1 text-[11.5px] text-text-dim">${SHELL_ICONS[s.icon]||"•"} ${s.count??s.label??""}</span>`).join("")}
        </div>
      </td>
      <td class="px-4 py-3">
        <a class="inline-block bg-[#1b1b20] border border-panel-border text-text-dim font-extrabold text-[11px] px-3 py-1.5 rounded-md no-underline hover:opacity-80 transition-opacity ${p.live?"!bg-accent !text-bg !border-accent":""}"
          href="${p.opggUrl}" target="_blank" rel="noopener">OP.GG</a>
      </td>
    </tr>`;
  }).join("");
}
