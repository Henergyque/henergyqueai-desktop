"use strict";
const INK = { a:"#f6c9a8", b:"#edac88", c:"#c46c4f", d:"#95503f", e:"#784e3e", f:"#5d3b2f", o:"#3f261e", w:"#fff1e4" };

// ─── Outils de dessin ───────────────────────────────────────
const svgOf = (grid, px, w, h) => {
  let r = "";
  grid.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = INK[row[x]]; if (c) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`; } });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w*px}" height="${h*px}">${r}</svg>`;
};
const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
const paste = (canvas, grid, dx = 0, dy = 0, map) => {
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "." || ch === "·") return;
    const ty = y + dy, tx = x + dx;
    if (canvas[ty] && tx >= 0 && tx < canvas[0].length) canvas[ty][tx] = map ? (map[ch] ?? ch) : ch;
  }));
  return canvas;
};
const rows = (canvas) => canvas.map((r) => r.join(""));
const mirror = (half) => half.map(([l, m]) => l + m + [...l].reverse().join(""));
// Aile vue de face resserrée : la moitié gauche est échantillonnée vers le corps.
const squeezeHalf = (half, k) => half.map(([l, m]) => {
  const w = l.length; let out = "";
  for (let x = 0; x < w; x++) { const d = w - x; const src = w - Math.round(d / k); out += src >= 0 && d / k <= w ? l[src] : "."; }
  return [out, m];
});
// Aile vue de profil qui bat : on l'écrase verticalement autour de sa base.
const flapWing = (wing, base, s) => {
  const h = wing.length, w = wing[0].length, out = blank(w, h + 8);
  for (let ty = 0; ty < h + 8; ty++) for (let x = 0; x < w; x++) {
    if (Math.abs(s) < 0.08) continue;
    const sy = Math.round(base + (ty - base) / s);
    if (sy < 0 || sy >= h || sy > base + 1) continue;
    const ch = wing[sy][x]; if (ch !== ".") out[ty][x] = ch;
  }
  // Ailes presque à plat : une fine lame.
  if (Math.abs(s) < 0.08) for (let x = 0; x < w; x++) if (wing.some((r) => r[x] !== ".") && x < 12) out[base][x] = x % 3 ? "c" : "d";
  return out.map((r) => r.join(""));
};

// ─── 1. Face · actuel ────────────────────────────────────────
const HEADS = { g:["·b..........b..","..b........b..."], f:["..b.........b..","...b.......b..."], d:["..b..........b·","...b........b.."] };
const OUV = mirror([[".bbbb..","e"],["bbaabb.","e"],["bbaabbe","f"],[".bbbcce","f"],["..cccc.","f"],["..cddc.","f"],["...dd..","e"],[".......","e"]]);
const MI = mirror([["...bbb.","e"],["..bbaab","e"],["..bbaab","f"],["...bbcc","f"],["...cccc","f"],["...cddc","f"],["....dd.","e"],[".......","e"]]);
const FER = mirror([["....bb.","e"],["....baa","e"],["....bba","f"],["....bbc","f"],[".....cc","f"],[".....cd","f"],["......d","e"],[".......","e"]]);
const faceActuel = { w:15, h:10, frames:[[...HEADS.f,...OUV],[...HEADS.g,...MI],[...HEADS.g,...FER],[...HEADS.g,...MI],[...HEADS.f,...OUV],[...HEADS.d,...MI],[...HEADS.d,...FER],[...HEADS.d,...MI]], speed:130, pause:2600 };

// ─── 2. Face · détaillé ─────────────────────────────────────
const HALF = [
  ["..o.......","."],
  ["...o......","."],
  ["....o.....","."],
  [".oooo.o...","."],
  ["oaaabo.o..","o"],
  ["oaawabboo.","f"],
  ["oaaabbbcoo","f"],
  ["obbbbcccdo","e"],
  [".obbcccddo","e"],
  ["..oocdddoo","e"],
  ["...obcco..","f"],
  ["..obcwdco.","f"],
  ["..obccddo.","e"],
  ["...occdo..","e"],
  ["....ooo...","."],
];
const faceDetail = { w:21, h:15, frames:[1, .72, .42, .72, 1].map((k) => mirror(squeezeHalf(HALF, k))), speed:110, pause:2200 };

// ─── 3 à 7. Profil (tourné vers la droite) ───────────────────
// Dessiné à la main : bordure sombre à points clairs, une seule nervure
// entre l'aile avant et l'aile arrière, tête ronde et antenne à massue.
const SW = 20;
const WING = [
  "...........ooo......",
  ".........oofwfo.....",
  "........ofwaaaco....",
  ".......owaaabbco....",
  "......ofaabbbbco....",
  "......owabbbbbco....",
  ".....ofbbbbbcco.....",
  ".....owbbbcccco.....",
  "......oocccccdo.....",
  "....ofbbocccddo.....",
  "...owbbbbocdddo.....",
  "...ofbbcccoddo......",
  "...owccccccodo......",
  "....ofwfwfwfo.......",
  ".....ooooooo........",
];
const BASE = 13;
const BODY = [
  "....................",
  "...................c",
  "..................cc",
  "..................o.",
  "..................o.",
  ".................o..",
  ".................o..",
  ".................o..",
  "................o...",
  "................o...",
  "...............ooo..",
  "..............oeweo.",
  ".............oeeeeo.",
  "............offfoo..",
  "....ooooooooffffo...",
  "...oeefeefeeffffo...",
  "....ooooooooo.o.o...",
  ".............o...o..",
];
const SHADE = { a: "d", b: "d", c: "e", d: "f", w: "d", f: "f", o: "o" };
const side = ({ wings, far, legs = true, h = 18, dx = 0, dy = 0, farAt = [2, -2] }) =>
  wings.map((s, i) => {
    const c = blank(SW + dx, h);
    if (far) paste(c, flapWing(WING, BASE, far[i]), farAt[0], farAt[1] + dy, SHADE);
    paste(c, BODY, 0, dy);
    paste(c, flapWing(WING, BASE, s), 0, dy);
    if (!legs) c[17 + dy] = Array(SW + dx).fill(".");
    return rows(c);
  });
const profilPose = { w: 20, h: 18, frames: side({ wings: [1, 0.93, 0.86, 0.93, 1] }), speed: 170, pause: 2400 };
const profilVol = { w: 20, h: 22, frames: side({ wings: [1, 0.55, 0, -0.5, 0, 0.55], legs: false, h: 22 }), speed: 95, pause: 0 };
const deuxAiles = {
  w: 22,
  h: 20,
  frames: side({ wings: [1, 0.94, 0.88, 0.94, 1], far: [1, 0.94, 0.88, 0.94, 1], h: 20, dx: 2, dy: 2 }),
  speed: 170,
  pause: 2400,
};
const troisQuarts = {
  w: 22,
  h: 24,
  frames: side({ wings: [1, 0.55, 0, -0.5, 0, 0.55], far: [0.95, 0.5, 0, -0.45, 0, 0.5], legs: false, h: 24, dx: 2, dy: 2 }),
  speed: 95,
  pause: 0,
};

// Versions compactes (15 × 10) : la taille de l'en-tête du CLI.
const WING_C = [
  ".......ooo.....",
  ".....ofwaco....",
  "....owaabco....",
  "...ofabbbco....",
  "...owbbccdo....",
  "..ofboccddo....",
  "..owbboddo.....",
  "...ofwfwo......",
];
const BODY_C = [
  "..............c",
  ".............c.",
  "............o..",
  "............o..",
  "............o..",
  "...........ooo.",
  "..........eewo.",
  ".........eeeeo.",
  "..oeefeefeeoo..",
  "...ooooooooo.o.",
];
const sideC = (wings, far) =>
  wings.map((s, i) => {
    const c = blank(15, 10);
    if (far) paste(c, flapWing(WING_C, 7, far[i]).slice(0, 10), 1, -1, SHADE);
    paste(c, BODY_C);
    paste(c, flapWing(WING_C, 7, s).slice(0, 10));
    return rows(c);
  });
const compactPose = { w: 15, h: 10, frames: sideC([1, 0.9, 0.8, 0.9, 1]), speed: 170, pause: 2400 };
const compactVol = { w: 15, h: 10, frames: sideC([1, 0.5, 0, 0.5]), speed: 110, pause: 0 };
const compactDeux = { w: 15, h: 10, frames: sideC([1, 0.9, 0.8, 0.9, 1], [1, 0.9, 0.8, 0.9, 1]), speed: 170, pause: 2400 };
const compactVolDeux = { w: 15, h: 10, frames: sideC([1, 0.5, 0, 0.5], [0.9, 0.45, 0, 0.45]), speed: 110, pause: 0 };

// Posé sur une feuille.
const LEAF = [
  "..................ooo...",
  "......oooooooooooogggo..",
  "....ooggggggggggggggggo.",
  "...oggggGgggGggggGgggo..",
  "....ooggggggggggggggoo..",
  "......oooooooooooooo....",
];
INK.g = "#7c9a62";
INK.G = "#5d7a48";
const feuille = {
  w: 24,
  h: 23,
  frames: [1, 0.92, 0.84, 0.92, 1].map((s) => {
    const c = blank(24, 23);
    paste(c, LEAF, 0, 16);
    paste(c, BODY, 1, 0);
    paste(c, flapWing(WING, BASE, s), 1, 0);
    return rows(c);
  }),
  speed: 180,
  pause: 2600,
};



const VARIANTS = [
  { title: "Face · actuel", text: "Le papillon d’aujourd’hui, la tête qui tourne entre deux battements d’ailes.", v: faceActuel, term: faceActuel },
  { title: "Face · détaillé", text: "Plus grand, avec des contours sombres, des taches claires et des ocelles sur les ailes arrière.", v: faceDetail, term: faceDetail, note: "Dans le terminal, il prend 8 lignes : l’en-tête devra grandir." },
  { title: "Profil · posé", text: "Vu de côté, ailes refermées au-dessus du dos, qui respirent doucement.", v: profilPose, term: compactPose },
  { title: "Profil · en vol", text: "Vu de côté, un battement complet : ailes hautes, à plat, puis basses.", v: profilVol, term: compactVol },
  { title: "Profil · deux ailes", text: "Posé, l’aile du fond dépasse derrière la première, ce qui donne du relief.", v: deuxAiles, term: compactDeux },
  { title: "Trois-quarts · en vol", text: "En vol, avec l’aile du fond visible et plus sombre.", v: troisQuarts, term: compactVolDeux },
  { title: "Profil · sur une feuille", text: "Posé sur une petite feuille, pour l’écran d’accueil de VS Code.", v: feuille, term: compactPose, note: "Dans le terminal : le profil posé, sans la feuille." },
];

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const termOf = (grid, w) => {
  let out = "";
  for (let y = 0; y < grid.length; y += 2) {
    for (let x = 0; x < w; x++) {
      const t = INK[grid[y]?.[x]], b = INK[grid[y + 1]?.[x]];
      if (!t && !b) out += " ";
      else if (t && !b) out += `<span style="color:${t}">▀</span>`;
      else if (!t && b) out += `<span style="color:${b}">▄</span>`;
      else out += `<span style="color:${t};background:${b}">▀</span>`;
    }
    out += "\n";
  }
  return out;
};
const animate = (v, draw, delay) => {
  let at = 0;
  draw(0);
  if (reduce) return;
  const loop = () => {
    at += 1;
    if (at >= v.frames.length) { at = 0; draw(0); setTimeout(loop, v.pause || v.speed); return; }
    draw(at);
    setTimeout(loop, v.speed);
  };
  setTimeout(loop, delay);
};

const track = document.getElementById("track");
const dots = document.getElementById("dots");
const cards = [];
let chosen = null;
try { const saved = Number(localStorage.getItem("papillon-choisi")); if (saved >= 1 && saved <= VARIANTS.length) chosen = saved; } catch {}

VARIANTS.forEach((item, index) => {
  const n = index + 1;
  const { v, term } = item;
  const big = Math.floor(Math.min(200 / v.h, 250 / v.w));
  const card = document.createElement("article");
  card.className = "card";
  card.id = `papillon-${n}`;
  card.innerHTML = `
    <div class="stage"><span class="num">${n}</span><button class="bg-toggle" type="button">Fond clair</button><div class="big"></div></div>
    <div class="info">
      <h2>${item.title}</h2>
      <p>${item.text}</p>
      <div class="sizes"><span class="size dark"><span class="s1"></span>Henergyque<b>AI</b></span><span class="size light"><span class="s2"></span>Henergyque<b>AI</b></span></div>
      <span class="label">Dans le terminal</span>
      <div class="term"><div class="bar"><i></i><i></i><i></i><span>henergyqueai</span></div>
        <div class="screen"><pre class="art"></pre><div class="facts"><b>HenergyqueAI</b> <em>v0.8.0</em><br>Oryne <em>· demander</em><br><em>~/mon-projet</em></div></div></div>
      ${item.note ? `<p class="note">${item.note}</p>` : ""}
      <button class="pick" type="button">Je préfère celui-ci</button>
    </div>`;
  track.append(card);
  const stage = card.querySelector(".stage");
  const toggle = card.querySelector(".bg-toggle");
  toggle.addEventListener("click", () => {
    stage.classList.toggle("light");
    toggle.textContent = stage.classList.contains("light") ? "Fond sombre" : "Fond clair";
  });
  card.querySelector(".pick").addEventListener("click", () => choose(chosen === n ? null : n));
  const slots = [[card.querySelector(".big"), big], [card.querySelector(".s1"), 26 / v.w], [card.querySelector(".s2"), 26 / v.w]];
  const art = card.querySelector(".art");
  animate(v, (f) => {
    slots.forEach(([el, px]) => (el.innerHTML = svgOf(v.frames[f % v.frames.length], px, v.w, v.h)));
    art.innerHTML = termOf(term.frames[f % term.frames.length], term.w);
  }, 500 + index * 230);
  const dot = document.createElement("button");
  dot.type = "button";
  dot.textContent = n;
  dot.setAttribute("aria-label", `Papillon ${n} : ${item.title}`);
  dot.addEventListener("click", () => card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", inline: "center", block: "nearest" }));
  dots.append(dot);
  cards.push({ card, dot, item });
});

document.getElementById("brand-art").innerHTML = svgOf(faceActuel.frames[0], 2, faceActuel.w, faceActuel.h);

let choiceStop = null;
function choose(n) {
  chosen = n;
  try { n ? localStorage.setItem("papillon-choisi", String(n)) : localStorage.removeItem("papillon-choisi"); } catch {}
  cards.forEach(({ card, dot }, index) => {
    const on = index + 1 === n;
    card.classList.toggle("chosen", on);
    dot.classList.toggle("fav", on);
    card.querySelector(".pick").textContent = on ? "Mon préféré ✓" : "Je préfère celui-ci";
    card.querySelector(".chosen-badge")?.remove();
    if (on) card.querySelector(".stage").insertAdjacentHTML("beforeend", '<span class="chosen-badge">Préféré</span>');
  });
  const label = document.getElementById("choice-label");
  const name = document.getElementById("choice-name");
  const art = document.getElementById("choice-art");
  renderSend();
  if (!n) {
    label.textContent = "Aucun choix pour l’instant";
    name.textContent = "Touchez « Je préfère celui-ci »";
    art.innerHTML = "";
    return;
  }
  const { item } = cards[n - 1];
  label.textContent = sent === n ? "Envoyé, merci !" : "Votre préféré";
  name.textContent = `${n} · ${item.title}`;
  const px = Math.min(34 / item.v.w, 34 / item.v.h);
  art.innerHTML = svgOf(item.v.frames[0], px, item.v.w, item.v.h);
}

// Envoi du choix : seulement sur la page à lien secret, dont l'adresse porte
// la clé du sondage.
const pollKey = /\/apercu-([a-f0-9]{24})\//.exec(location.pathname)?.[1] || null;
const openButton = document.getElementById("send-open");
const form = document.getElementById("send-form");
const submitButton = document.getElementById("send-submit");
const sendError = document.getElementById("send-error");
let sent = null;
try { sent = Number(localStorage.getItem("papillon-envoye")) || null; } catch {}
let voter = null;
try { voter = localStorage.getItem("papillon-votant"); } catch {}
if (!voter || !/^[a-f0-9-]{16,64}$/.test(voter)) {
  voter = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  try { localStorage.setItem("papillon-votant", voter); } catch {}
}
function renderSend() {
  const ready = Boolean(pollKey && chosen);
  openButton.hidden = !ready || !form.hidden;
  if (!ready) form.hidden = true;
  openButton.classList.toggle("done", sent === chosen);
  openButton.textContent = sent === chosen ? "Modifier" : sent ? "Envoyer ce choix" : "Envoyer";
}
openButton.addEventListener("click", () => {
  form.hidden = false;
  sendError.hidden = true;
  renderSend();
  document.getElementById("voter-name").focus();
});
document.getElementById("send-cancel").addEventListener("click", () => {
  form.hidden = true;
  renderSend();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!chosen || !pollKey) return;
  submitButton.disabled = true;
  submitButton.textContent = "Envoi…";
  sendError.hidden = true;
  try {
    const response = await fetch("/api/sondages/papillon", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "HenergyqueAI" },
      body: JSON.stringify({
        key: pollKey,
        voter,
        choice: chosen,
        name: document.getElementById("voter-name").value,
        comment: document.getElementById("voter-comment").value,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "L’envoi n’a pas abouti.");
    sent = chosen;
    try { localStorage.setItem("papillon-envoye", String(sent)); } catch {}
    form.hidden = true;
    choose(chosen);
  } catch (error) {
    sendError.textContent = `${error.message} Vérifiez la connexion puis réessayez.`;
    sendError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Envoyer mon choix";
  }
});
choose(chosen);

// Le numéro de la carte visible s'allume sous le carrousel.
const seen = new IntersectionObserver(
  (entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const index = cards.findIndex(({ card }) => card === entry.target);
    cards.forEach(({ dot }, at) => dot.classList.toggle("on", at === index));
  }),
  { root: track, threshold: 0.6 },
);
cards.forEach(({ card }) => seen.observe(card));
cards[0].dot.classList.add("on");
if (location.hash && /^#papillon-\d$/.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView({ inline: "center", block: "nearest" });
