// app.js — UI logic, map layers, proposals workflow, demo AI agent

import {
  MAP_CENTER, MAP_ZOOM,
  SCHOOL_BUFFER_M, DENSITY_THRESHOLDS,
  EXISTING_AREAS, SCHOOL_ZONES, AQI_SENSORS, PROPOSALS,
  METERS_PER_DEG_LAT
} from "./data.js";

// -------------------- State --------------------
const state = {
  live: true,
  selectedProposalId: null,
  map: null,
  layers: {
    density: L.layerGroup(),
    schools: L.layerGroup(),
    existing: L.layerGroup(),
    proposals: L.layerGroup(),
    aqi: L.layerGroup(),
    gaps: L.layerGroup(),
  },
  // mutable copies for live simulation
  existing: structuredClone(EXISTING_AREAS),
  aqi: structuredClone(AQI_SENSORS),
  proposals: structuredClone(PROPOSALS),
};

// -------------------- Helpers --------------------
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function fmtPct(x){ return `${Math.round(x*100)}%`; }

function occupancyRatio(area){
  return area.capacity <= 0 ? 0 : clamp(area.occupancy / area.capacity, 0, 2);
}

// Very simple “density score” = normalized occupancy + normalized AQI near it
function densityScore(area){
  const occ = occupancyRatio(area); // 0..2
  const nearest = nearestPoint([area.lat, area.lng], state.aqi);
  const aqiNorm = clamp((nearest.aqi - 50) / 80, 0, 1.5); // rough normalize
  return clamp(0.65*occ + 0.35*aqiNorm, 0, 2);
}

function densityColor(score){
  if(score < DENSITY_THRESHOLDS.green) return { stroke:"rgba(34,197,94,.95)", fill:"rgba(34,197,94,.30)", label:"Low" };
  if(score < DENSITY_THRESHOLDS.yellow) return { stroke:"rgba(245,158,11,.95)", fill:"rgba(245,158,11,.30)", label:"Medium" };
  return { stroke:"rgba(239,68,68,.95)", fill:"rgba(239,68,68,.30)", label:"High" };
}

function haversineMeters(a, b){
  const toRad = (d)=> d*Math.PI/180;
  const R = 6371000;
  const [lat1, lon1] = a; const [lat2, lon2] = b;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const s1 = Math.sin(dLat/2);
  const s2 = Math.sin(dLon/2);
  const q = s1*s1 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(q));
}

function nearestPoint(latlng, points){
  let best = null, bestD = Infinity;
  for(const p of points){
    const d = haversineMeters(latlng, [p.lat, p.lng]);
    if(d < bestD){ bestD = d; best = p; }
  }
  return best;
}

function isProposalCompliant(proposal){
  // compliant if at least 200m away from ANY school
  const p = [proposal.lat, proposal.lng];
  let minD = Infinity;
  for(const s of SCHOOL_ZONES){
    minD = Math.min(minD, haversineMeters(p, [s.lat, s.lng]));
  }
  return { compliant: minD >= SCHOOL_BUFFER_M, minDistM: Math.round(minD) };
}

function nowTime(){
  return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

// -------------------- Tabs --------------------
function setupTabs(){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      btn.classList.add("active");
      const name = btn.dataset.tab;
      showTab(name);
    });
  });
}

function showTab(name){
  const sections = ["overview","heatmap","proposals","agent"];
  for(const s of sections){
    document.getElementById(`tab-${s}`).classList.toggle("hidden", s !== name);
    const tabBtn = document.querySelector(`.tab[data-tab="${s}"]`);
    if(tabBtn) tabBtn.setAttribute("aria-selected", s === name ? "true" : "false");
  }
  if(name === "heatmap"){
    // Leaflet needs a resize tick when revealed
    setTimeout(()=> state.map?.invalidateSize(), 80);
  }
}

// -------------------- Overview --------------------
function renderOverview(){
  const statGrid = document.getElementById("statGrid");
  statGrid.innerHTML = "";

  const activeAreas = state.existing.length;
  const schoolZones = SCHOOL_ZONES.length;

  const overcrowded = state.existing.filter(a => occupancyRatio(a) >= 0.85).length;

  const approvedProposals = state.proposals.filter(p => p.status === "Approved").length;

  const avgAqi = Math.round(state.aqi.reduce((s,x)=> s+x.aqi, 0)/state.aqi.length);

  // demo daily users (simulate)
  const dailyUsers = 1200 + Math.round(Math.random()*800);

  const cards = [
    { k:"Active areas", v: activeAreas, hint:"Designated smoking areas tracked" },
    { k:"Protected school zones", v: schoolZones, hint:"200m buffer compliance layer" },
    { k:"Overcrowded spots", v: overcrowded, hint:"Occupancy ≥ 85% capacity" },
    { k:"Approved proposals", v: approvedProposals, hint:"Ready for rollout" },
    { k:"Average AQI", v: avgAqi, hint:"From sensor points" },
    { k:"Daily users", v: dailyUsers, hint:"Guidance + reporting sessions" },
  ];

  for(const c of cards){
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `
      <div class="k">${c.k}</div>
      <div class="v">${c.v}</div>
      <div class="hint">${c.hint}</div>
    `;
    statGrid.appendChild(el);
  }

  // Planning signals
  const pressure = topPressureDistrict();
  document.getElementById("pressureDistrict").textContent = pressure;

  const worst = state.aqi.reduce((a,b)=> a.aqi>b.aqi?a:b);
  document.getElementById("worstAQI").textContent = `${worst.aqi} (${worst.name.replace("Sensor: ","")})`;

  const nearSchoolProposals = state.proposals.filter(p => !isProposalCompliant(p).compliant).length;
  document.getElementById("riskFlags").textContent = `${overcrowded + nearSchoolProposals}`;
}

function topPressureDistrict(){
  const byDistrict = new Map();
  for(const a of state.existing){
    const score = densityScore(a);
    byDistrict.set(a.district, (byDistrict.get(a.district)||0) + score);
  }
  let best = null, bestV=-Infinity;
  for(const [k,v] of byDistrict.entries()){
    if(v>bestV){ bestV=v; best=k; }
  }
  return best ?? "—";
}

// -------------------- Map --------------------
function initMap(){
  const map = L.map("map", { zoomControl:true }).setView(MAP_CENTER, MAP_ZOOM);
  state.map = map;

  // Free tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Add layers
  Object.values(state.layers).forEach(lg=> lg.addTo(map));

  renderMapLayers();
  setupMapToggles();
  renderHotspots();
}

function clearLayers(){
  for(const k of Object.keys(state.layers)){
    state.layers[k].clearLayers();
  }
}

function renderMapLayers(){
  clearLayers();

  // School buffers
  for(const s of SCHOOL_ZONES){
    const center = [s.lat, s.lng];
    const icon = L.divIcon({
      className: "emoji-icon",
      html: `<div style="font-size:18px;">🏫</div>`,
      iconSize: [24,24],
      iconAnchor:[12,12]
    });
    const marker = L.marker(center, { icon })
      .bindPopup(`<b>${s.name}</b><br/>Protected buffer: ${SCHOOL_BUFFER_M}m`);
    state.layers.schools.addLayer(marker);

    const circle = L.circle(center, {
      radius: SCHOOL_BUFFER_M,
      color: "rgba(239,68,68,.70)",
      fillColor: "rgba(239,68,68,.18)",
      fillOpacity: 1,
      weight: 2
    }).bindPopup(`<b>${s.name}</b><br/>Exclusion buffer: ${SCHOOL_BUFFER_M}m`);
    state.layers.schools.addLayer(circle);
  }

  // Existing DSAs + density circles
  for(const a of state.existing){
    const pos = [a.lat, a.lng];
    const occ = occupancyRatio(a);
    const score = densityScore(a);
    const dc = densityColor(score);

    const icon = L.divIcon({
      className:"emoji-icon",
      html:`<div style="font-size:18px;">🚬</div>`,
      iconSize:[24,24],
      iconAnchor:[12,12]
    });

    const marker = L.marker(pos, { icon }).bindPopup(
      `<b>${a.name}</b><br/>
       District: ${a.district}<br/>
       Occupancy: ${a.occupancy}/${a.capacity} (${fmtPct(occ)})`
    );
    state.layers.existing.addLayer(marker);

    const circle = L.circle(pos, {
      radius: 120 + Math.round(score*140), // visual only
      color: dc.stroke,
      fillColor: dc.fill,
      fillOpacity: 1,
      weight: 2
    }).bindPopup(
      `<b>Density: ${dc.label}</b><br/>
       ${a.name}<br/>
       Score: ${score.toFixed(2)}`
    );
    state.layers.density.addLayer(circle);
  }

  // Proposals
  for(const p of state.proposals){
    const pos = [p.lat, p.lng];
    const c = isProposalCompliant(p);
    const status = p.status;

    const iconHtml = status === "Approved" ? "📍✅" : status === "Under Review" ? "📍🟡" : "📍";
    const icon = L.divIcon({
      className:"emoji-icon",
      html:`<div style="font-size:18px;">${iconHtml}</div>`,
      iconSize:[30,30],
      iconAnchor:[15,15]
    });

    const popup = `
      <b>${p.name}</b><br/>
      District: ${p.district}<br/>
      Suitability score: ${(p.score).toFixed(2)}<br/>
      Status: ${p.status}<br/>
      School buffer: ${c.compliant ? "✅ compliant" : "❌ too close"} (min ${c.minDistM}m)
    `;

    const marker = L.marker(pos, { icon }).bindPopup(popup);
    state.layers.proposals.addLayer(marker);
  }

  // AQI sensors
  for(const s of state.aqi){
    const pos = [s.lat, s.lng];
    const aqi = s.aqi;
    const label = aqi >= 95 ? "High" : aqi >= 85 ? "Moderate" : "Low";
    const color = aqi >= 95 ? "rgba(239,68,68,.9)" : aqi >= 85 ? "rgba(245,158,11,.9)" : "rgba(34,197,94,.9)";

    const circle = L.circle(pos, {
      radius: 80,
      color,
      fillColor: color.replace(".9",".25"),
      fillOpacity: 1,
      weight: 2
    }).bindPopup(`<b>${s.name}</b><br/>AQI: ${aqi} (${label})`);
    state.layers.aqi.addLayer(circle);
  }

  applyLayerVisibilityFromToggles();
}

function setupMapToggles(){
  const ids = ["toggleDensity","toggleSchools","toggleExisting","toggleProposals","toggleAQI"];
  ids.forEach(id=>{
    document.getElementById(id).addEventListener("change", applyLayerVisibilityFromToggles);
  });
}

function applyLayerVisibilityFromToggles(){
  const showDensity = document.getElementById("toggleDensity").checked;
  const showSchools = document.getElementById("toggleSchools").checked;
  const showExisting = document.getElementById("toggleExisting").checked;
  const showProposals = document.getElementById("toggleProposals").checked;
  const showAqi = document.getElementById("toggleAQI").checked;

  toggleLayer(state.layers.density, showDensity);
  toggleLayer(state.layers.schools, showSchools);
  toggleLayer(state.layers.existing, showExisting);
  toggleLayer(state.layers.proposals, showProposals);
  toggleLayer(state.layers.aqi, showAqi);
  // gaps layer stays until user clears via rerender
}

function toggleLayer(layerGroup, enabled){
  if(!state.map) return;
  if(enabled){
    if(!state.map.hasLayer(layerGroup)) layerGroup.addTo(state.map);
  } else {
    if(state.map.hasLayer(layerGroup)) state.map.removeLayer(layerGroup);
  }
}

function renderHotspots(){
  const list = document.getElementById("hotspotList");
  list.innerHTML = "";

  const ranked = state.existing
    .map(a => ({ a, score: densityScore(a) }))
    .sort((x,y)=> y.score - x.score)
    .slice(0, 6);

  for(const r of ranked){
    const dc = densityColor(r.score);
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div><b>${r.a.name}</b> <span class="mono">(${r.a.district})</span></div>
      <div class="muted">Density: <b>${dc.label}</b> • Score ${r.score.toFixed(2)} • Occupancy ${r.a.occupancy}/${r.a.capacity}</div>
    `;
    el.addEventListener("click", ()=>{
      showTab("heatmap");
      const p = [r.a.lat, r.a.lng];
      state.map.setView(p, 15, { animate:true });
      L.popup().setLatLng(p).setContent(`<b>${r.a.name}</b><br/>Hotspot: ${dc.label}`).openOn(state.map);
    });
    list.appendChild(el);
  }
}

// -------------------- Coverage gaps (demo heuristic) --------------------
function identifyCoverageGaps(){
  // Rough approach: pick 3 random candidate points; choose those farthest from existing DSAs
  const candidates = [
    { name:"Gap candidate: Serangoon", lat:1.3496, lng:103.8737 },
    { name:"Gap candidate: Toa Payoh", lat:1.3327, lng:103.8480 },
    { name:"Gap candidate: Queenstown", lat:1.2947, lng:103.8062 },
    { name:"Gap candidate: Kallang", lat:1.3114, lng:103.8711 },
    { name:"Gap candidate: Sengkang", lat:1.3916, lng:103.8955 },
  ];

  const scored = candidates.map(c=>{
    const d = nearestDistanceToExisting([c.lat, c.lng]);
    return { ...c, distM: Math.round(d) };
  }).sort((a,b)=> b.distM - a.distM);

  return scored.slice(0,3);
}

function nearestDistanceToExisting(latlng){
  let best = Infinity;
  for(const a of state.existing){
    best = Math.min(best, haversineMeters(latlng, [a.lat, a.lng]));
  }
  return best;
}

function showGapsOnMap(gaps){
  state.layers.gaps.clearLayers();
  for(const g of gaps){
    const icon = L.divIcon({
      className:"emoji-icon",
      html:`<div style="font-size:18px;">🧩</div>`,
      iconSize:[24,24],
      iconAnchor:[12,12]
    });
    const marker = L.marker([g.lat, g.lng], { icon })
      .bindPopup(`<b>${g.name}</b><br/>Nearest DSA distance: ${g.distM}m`);
    state.layers.gaps.addLayer(marker);
  }
}

// -------------------- Proposals --------------------
function renderProposalsTable(){
  const tbody = document.getElementById("proposalTableBody");
  tbody.innerHTML = "";

  for(const p of state.proposals){
    const c = isProposalCompliant(p);
    const complianceBadge = c.compliant
      ? `<span class="badge" style="color:rgba(34,197,94,.95);border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.10)">✅ ${c.minDistM}m</span>`
      : `<span class="badge" style="color:rgba(239,68,68,.95);border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.10)">❌ ${c.minDistM}m</span>`;

    const statusBadge = p.status === "Approved"
      ? `<span class="badge" style="color:rgba(34,197,94,.95);border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.10)">Approved</span>`
      : p.status === "Under Review"
      ? `<span class="badge" style="color:rgba(245,158,11,.95);border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.10)">Under Review</span>`
      : `<span class="badge">Pending</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${p.name}</b><div class="mono" style="opacity:.75">${p.id}</div></td>
      <td>${p.district}</td>
      <td><b>${(p.score).toFixed(2)}</b></td>
      <td>${complianceBadge}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn" data-action="review" data-id="${p.id}" style="padding:8px 10px;">Review</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('button[data-action="review"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      selectProposal(btn.dataset.id);
    });
  });
}

function selectProposal(id){
  state.selectedProposalId = id;
  const p = state.proposals.find(x => x.id === id);
  if(!p) return;

  const c = isProposalCompliant(p);

  document.getElementById("reviewTitle").textContent = p.name;
  document.getElementById("reviewMeta").textContent =
    `ID ${p.id} • District ${p.district} • Score ${(p.score).toFixed(2)} • Status ${p.status} • School min distance ${c.minDistM}m`;

  const lines = [
    `COMPLIANCE CHECK`,
    `- School buffer rule: >= ${SCHOOL_BUFFER_M}m from any school`,
    `- Result: ${c.compliant ? "PASS ✅" : "FAIL ❌"} (min distance ${c.minDistM}m)`,
    ``,
    `REASONING`,
    ...p.rationale.map(r => `- ${r}`),
    ``,
    `NOTES`,
    `- Consider foot-traffic routing and pedestrian access (real deployments should use route distance, not straight-line).`,
  ];

  document.getElementById("reviewBody").textContent = lines.join("\n");

  // enable actions
  document.getElementById("btnApprove").disabled = false;
  document.getElementById("btnHold").disabled = false;
  document.getElementById("btnReject").disabled = false;

  // also pan map to proposal if user is on heatmap
  if(!document.getElementById("tab-heatmap").classList.contains("hidden")){
    state.map.setView([p.lat,p.lng], 15, { animate:true });
  }
}

function setupProposalActions(){
  const approve = document.getElementById("btnApprove");
  const hold = document.getElementById("btnHold");
  const reject = document.getElementById("btnReject");
  const log = document.getElementById("reviewActionLog");

  function applyStatus(status){
    const id = state.selectedProposalId;
    if(!id) return;
    const p = state.proposals.find(x => x.id === id);
    if(!p) return;
    p.status = status;
    log.textContent = `[${nowTime()}] ${id} set to ${status}.`;
    renderProposalsTable();
    selectProposal(id);
    renderOverview();
    renderMapLayers();
  }

  approve.addEventListener("click", ()=> applyStatus("Approved"));
  hold.addEventListener("click", ()=> applyStatus("Under Review"));
  reject.addEventListener("click", ()=> applyStatus("Rejected"));
}

// -------------------- AI Agent (demo) --------------------
function chatAdd(role, text){
  const log = document.getElementById("chatLog");
  const msg = document.createElement("div");
  msg.className = "msg";

  const who = role === "user" ? "You" : "SmokeSmart Agent";
  msg.innerHTML = `
    <div class="meta">${who} • ${nowTime()}</div>
    <div class="bubble ${role === "user" ? "user" : ""}">${escapeHtml(text)}</div>
  `;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function agentRespond(userText){
  const t = userText.toLowerCase();

  if(t.includes("aqi")){
    const avg = Math.round(state.aqi.reduce((s,x)=>s+x.aqi,0)/state.aqi.length);
    const worst = state.aqi.reduce((a,b)=>a.aqi>b.aqi?a:b);
    return [
      `AQI summary (demo):`,
      `- Average AQI: ${avg}`,
      `- Worst sensor: ${worst.name} at AQI ${worst.aqi}`,
      `Suggestion: prioritize relocations or new DSAs away from pedestrian bottlenecks in the ${topPressureDistrict()} district during peak hours.`
    ].join("\n");
  }

  if(t.includes("hotspot") || t.includes("overcrowd")){
    const ranked = state.existing.map(a=>({a, score:densityScore(a)}))
      .sort((x,y)=>y.score-x.score).slice(0,5);

    return [
      `Top hotspots (crowding + AQI):`,
      ...ranked.map((r,i)=>`- ${i+1}) ${r.a.name} (${r.a.district}) • score ${r.score.toFixed(2)} • occ ${r.a.occupancy}/${r.a.capacity}`),
      ``,
      `Action idea: add or relocate capacity to reduce repeated exposure around these nodes.`
    ].join("\n");
  }

  if(t.includes("recommend") || t.includes("proposal") || t.includes("new location")){
    const recs = recommendProposals();
    return [
      `Recommendations (demo heuristic):`,
      ...recs.map(r => `- ${r.name} (${r.district}) • score ${(r.score).toFixed(2)} • school buffer ${r.compliant ? "PASS" : "FAIL"} (${r.minDistM}m)`),
      ``,
      `You can review these in the Proposals tab and approve/hold/reject.`
    ].join("\n");
  }

  if(t.includes("compliance") || t.includes("school")){
    const flagged = state.proposals
      .map(p => ({ p, c:isProposalCompliant(p) }))
      .filter(x => !x.c.compliant);

    if(flagged.length === 0){
      return `All current proposals pass the 200m school buffer check.`;
    }
    return [
      `School buffer compliance flags:`,
      ...flagged.map(x => `- ${x.p.id}: ${x.p.name} • min distance ${x.c.minDistM}m (FAIL)`),
      `Suggestion: nudge candidate points further along pedestrian-accessible corridors away from school perimeters.`
    ].join("\n");
  }

  if(t.includes("gap")){
    const gaps = identifyCoverageGaps();
    return [
      `Coverage gaps (demo):`,
      ...gaps.map(g => `- ${g.name.replace("Gap candidate: ","")} • nearest DSA ≈ ${g.distM}m`),
      `Tip: add DSAs where distance-to-nearest is highest *and* not within school buffers.`
    ].join("\n");
  }

  // default
  return [
    `I can help with:`,
    `- "AQI summary"`,
    `- "List hotspots"`,
    `- "Recommend new locations"`,
    `- "Check school compliance"`,
    `- "Find coverage gaps"`,
    ``,
    `Try one of those phrases.`
  ].join("\n");
}

function setupChat(){
  const input = document.getElementById("chatInput");
  const send = document.getElementById("chatSend");

  function submit(){
    const text = input.value.trim();
    if(!text) return;
    input.value = "";
    chatAdd("user", text);
    const reply = agentRespond(text);
    chatAdd("agent", reply);
  }

  send.addEventListener("click", submit);
  input.addEventListener("keydown", (e)=>{
    if(e.key === "Enter") submit();
  });

  // initial greeting
  chatAdd("agent", "Hi! I’m the SmokeSmart Planning Agent (demo). Ask me about hotspots, AQI, proposals, compliance, or coverage gaps.");
}

// -------------------- Recommendations (demo) --------------------
function recommendProposals(){
  // simple: take existing proposals + compute compliance; also boost if district is top pressure
  const top = topPressureDistrict();
  return state.proposals
    .map(p=>{
      const c = isProposalCompliant(p);
      const bonus = (p.district === top) ? 0.04 : 0;
      return { ...p, compliant:c.compliant, minDistM:c.minDistM, score: clamp(p.score + bonus, 0, 1) };
    })
    .sort((a,b)=> b.score - a.score);
}

// -------------------- Live simulation --------------------
let liveTimer = null;

function setLive(on){
  state.live = on;
  const text = document.getElementById("liveText");
  const dot = document.getElementById("liveDot");
  text.textContent = `Live data: ${on ? "ON" : "OFF"}`;
  dot.style.background = on ? "var(--ok)" : "var(--bad)";
  dot.style.boxShadow = on ? "0 0 0 4px rgba(34,197,94,.15)" : "0 0 0 4px rgba(239,68,68,.15)";

  if(liveTimer) clearInterval(liveTimer);
  if(on){
    liveTimer = setInterval(()=>{
      tickSimulation();
    }, 3500);
  }
}

function tickSimulation(){
  // tweak occupancy
  for(const a of state.existing){
    const delta = Math.round((Math.random()*8) - 4);
    a.occupancy = clamp(a.occupancy + delta, 0, a.capacity + 10);
  }
  // tweak AQI
  for(const s of state.aqi){
    const delta = Math.round((Math.random()*10) - 5);
    s.aqi = clamp(s.aqi + delta, 55, 115);
  }

  renderOverview();
  renderMapLayers();
  renderHotspots();
  renderProposalsTable();
}

// -------------------- Buttons / Tools --------------------
function setupActions(){
  const log = document.getElementById("quickActionLog");

  document.getElementById("btnJumpHeatmap").addEventListener("click", ()=>{
    showTab("heatmap");
    log.textContent = `[${nowTime()}] Opened Heatmap view.`;
  });

  document.getElementById("btnToggleLive").addEventListener("click", ()=>{
    setLive(!state.live);
    log.textContent = `[${nowTime()}] Live updates ${state.live ? "enabled" : "disabled"}.`;
  });

  document.getElementById("btnAutoRecommend").addEventListener("click", ()=>{
    const recs = recommendProposals().slice(0,3);
    log.textContent = `[${nowTime()}] Generated recommendations: ${recs.map(r=>r.id).join(", ")}.`;
    // also push to agent chat if on agent tab
    chatAdd("agent", agentRespond("recommend new locations"));
  });

  document.getElementById("btnFindGaps").addEventListener("click", ()=>{
    const gaps = identifyCoverageGaps();
    showGapsOnMap(gaps);
    const text = gaps.map(g=>`${g.name.replace("Gap candidate: ","")} (${g.distM}m)`).join(", ");
    document.getElementById("gapResult").textContent = `[${nowTime()}] Gap candidates: ${text}`;
  });

  // Agent tools
  document.getElementById("toolAqi").addEventListener("click", ()=> chatAdd("agent", agentRespond("aqi summary")));
  document.getElementById("toolHotspots").addEventListener("click", ()=> chatAdd("agent", agentRespond("list hotspots")));
  document.getElementById("toolRecommend").addEventListener("click", ()=> chatAdd("agent", agentRespond("recommend new locations")));
  document.getElementById("toolCompliance").addEventListener("click", ()=> chatAdd("agent", agentRespond("check school compliance")));
  document.getElementById("toolGaps").addEventListener("click", ()=> chatAdd("agent", agentRespond("find coverage gaps")));
}

// -------------------- Init --------------------
window.addEventListener("DOMContentLoaded", ()=>{
  setupTabs();
  setupActions();
  setupProposalActions();
  setupChat();

  renderOverview();
  renderProposalsTable();

  initMap(); // initialize after Leaflet loads

  // default live ON
  setLive(true);

  // show initial tab
  showTab("overview");
});

