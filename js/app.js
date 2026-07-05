/* =========================================================================
   CHINA — scroll-flight engine
   ========================================================================= */
(function () {
  "use strict";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ stars */
  (function stars() {
    const el = $("#stars");
    if (!el) return;
    const W = 1600, H = 900, n = 140;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">`;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = Math.random() * 1.3 + 0.2;
      const o = Math.random() * 0.6 + 0.15;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
    }
    s += `</svg>`;
    el.innerHTML = s;
  })();

  /* ------------------------------------------------------------- reveal-in */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal, .reveal-fade").forEach((el) => io.observe(el));

  /* -------------------------------------------------- pointer glass sheen */
  if (!("ontouchstart" in window)) {
    $$(".glass").forEach((g) => {
      g.addEventListener("pointermove", (e) => {
        const r = g.getBoundingClientRect();
        g.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
        g.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
      });
    });
  }

  /* ----------------------------------------------------------- flight legs */
  // bezier control points, normalised to viewport (x: 0=left→1=right, y: 0=top→1=bottom)
  const PATHS = [
    { m: "plane", p: [0.12, 0.70, 0.30, 0.09, 0.66, 0.07, 0.90, 0.30] }, // Warsaw → Hong Kong
    { m: "train", p: [0.88, 0.30, 0.64, 0.19, 0.38, 0.19, 0.12, 0.28] }, // Hong Kong → Shenzhen
    { m: "plane", p: [0.12, 0.44, 0.34, 0.10, 0.64, 0.08, 0.90, 0.30] }, // Shenzhen → Shanghai
    { m: "train", p: [0.88, 0.28, 0.62, 0.20, 0.38, 0.20, 0.12, 0.29] }, // Shanghai → Zhengzhou
    { m: "train", p: [0.12, 0.29, 0.40, 0.20, 0.62, 0.20, 0.88, 0.28] }, // Zhengzhou → Beijing
    { m: "plane", p: [0.90, 0.44, 0.64, 0.09, 0.30, 0.08, 0.10, 0.30] }, // Beijing → Warsaw
  ];

  const legEls   = $$(".leg");
  const vehicle  = $("#vehicle");
  const routeSvg = $("#route");
  const glowPath = $("#route .glow");
  const trailPath= $("#route .trail");
  const hero     = $(".hero");
  let curLeg = -1;

  // ---- cubic bezier in normalised (0..1) space — evaluated in JS, no SVG geometry calls ----
  function bez1(a, b, c, d, t){ const m = 1 - t; return m*m*m*a + 3*m*m*t*b + 3*m*t*t*c + t*t*t*d; }
  function ptAt(p, t){ return { x: bez1(p[0], p[2], p[4], p[6], t), y: bez1(p[1], p[3], p[5], p[7], t) }; }

  // full leg curve (normalised ×100) for the faint glow underlay
  function fullPathD(p){
    return `M${p[0]*100} ${p[1]*100}C${p[2]*100} ${p[3]*100} ${p[4]*100} ${p[5]*100} ${p[6]*100} ${p[7]*100}`;
  }
  // sub-curve 0..t via De Casteljau — the drawn trail ends exactly under the vehicle
  function partialPathD(p, t){
    const P0=[p[0],p[1]], P1=[p[2],p[3]], P2=[p[4],p[5]], P3=[p[6],p[7]];
    const L=(a,b)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
    const A=L(P0,P1), B=L(P1,P2), C=L(P2,P3), D=L(A,B), E=L(B,C), F=L(D,E);
    const s=v=>`${(v[0]*100).toFixed(2)} ${(v[1]*100).toFixed(2)}`;
    return `M${s(P0)}C${s(A)} ${s(D)} ${s(F)}`;
  }

  function placeVehicle(x, y, deg, flipX){
    vehicle.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg) scale(${flipX}, 1)`;
  }
  function setMode(m){ vehicle.classList.toggle("mode-train", m === "train"); }

  function updateFlight(){
    const H = innerHeight, W = innerWidth, mid = H * 0.5;
    let active = -1, prog = 0;
    for (let i = 0; i < legEls.length; i++){
      const r = legEls[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid){ active = i; prog = clamp((H - r.top) / (H + r.height), 0, 1); break; }
    }

    if (active !== -1){
      const cfg = PATHS[active];
      if (active !== curLeg){ setMode(cfg.m); glowPath.setAttribute("d", fullPathD(cfg.p)); curLeg = active; }
      const pAdj = clamp((prog - 0.15) / 0.70, 0, 1);   // cross during central 70% of the scroll
      const a = ptAt(cfg.p, pAdj);
      const b = ptAt(cfg.p, clamp(pAdj + 0.012, 0, 1)); // look-ahead for heading
      const x = a.x * W, y = a.y * H;
      const dxs = (b.x - a.x) * W, dys = (b.y - a.y) * H;
      const flipX = dxs < 0 ? -1 : 1;                    // mirror to face travel direction
      const maxBank = cfg.m === "train" ? 12 : 30;
      const deg = clamp(Math.atan2(dys, Math.abs(dxs)) * 180 / Math.PI, -maxBank, maxBank);
      placeVehicle(x, y, deg, flipX);
      trailPath.setAttribute("d", partialPathD(cfg.p, pAdj));
      routeSvg.style.opacity = 1;
      vehicle.classList.add("show");
      return;
    }

    // between legs — park the plane over the hero, otherwise hide (you've landed)
    curLeg = -1;
    routeSvg.style.opacity = 0;
    trailPath.setAttribute("d", "");
    if (hero.getBoundingClientRect().bottom > H * 0.45){
      setMode("plane");
      placeVehicle(W * 0.19, H * 0.80, -4, 1);
      vehicle.classList.add("show");
    } else {
      vehicle.classList.remove("show");
    }
  }

  /* -------------------------------------------------- dest photo parallax */
  const dests = $$(".dest");
  function updateParallax() {
    const H = innerHeight;
    dests.forEach((d) => {
      const r = d.getBoundingClientRect();
      if (r.bottom < -50 || r.top > H + 50) return;
      const off = ((r.top + r.height / 2) - H / 2) / H; // -~1 .. 1
      const ph = d.querySelector(".photo");
      if (ph) ph.style.transform = `translateY(${(-off * 46).toFixed(1)}px) scale(1.06)`;
    });
  }

  /* ---------------------------------------------------------- rail active */
  const railDots = $$("#rail .dot");
  const railSections = $$("[data-rail]");
  function updateRail() {
    const mid = innerHeight * 0.5;
    let id = null;
    for (const s of railSections) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { id = s.getAttribute("data-rail"); break; }
    }
    if (id) railDots.forEach((d) => d.classList.toggle("active", d.getAttribute("data-target") === id));
  }

  /* -------------------------------------------------------- scroll driver */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      try { updateFlight(); updateParallax(); updateRail(); }
      finally { ticking = false; }   // never let a throw freeze the scroll loop
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { curLeg = -1; onScroll(); });

  /* ---------------------------------------------------------- budget tiers */
  const TIER = { budget: "b", mid: "m", comfort: "c" };
  const fmt = (n) => "zł " + Math.round(n).toLocaleString("pl-PL").replace(/ /g, " ");
  const animatedCells = $$("[data-b]");
  const tierBtns = $$(".tier-switch button");
  let curVals = new WeakMap();

  function renderTier(tier, animate) {
    const key = TIER[tier];
    animatedCells.forEach((cell) => {
      const target = parseFloat(cell.getAttribute("data-" + key));
      const from = animate ? (curVals.get(cell) || 0) : target;
      curVals.set(cell, target);
      if (reduce || !animate) { cell.textContent = fmt(target); return; }
      const t0 = performance.now(), dur = 650;
      (function step(now) {
        const k = clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        cell.textContent = fmt(lerp(from, target, e));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
  tierBtns.forEach((b) => b.addEventListener("click", () => {
    tierBtns.forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    renderTier(b.getAttribute("data-tier"), true);
  }));
  // count-up when budget scrolls into view (default: mid tier)
  const budgetSec = $("#budget");
  if (budgetSec) {
    const bo = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { renderTier("mid", true); bo.disconnect(); } });
    }, { threshold: 0.2 });
    bo.observe(budgetSec);
    renderTier("mid", false); // seed values immediately (no anim) so no blank flash
  }

  /* ---------------------------------------------------------- world map */
  function renderWorldMap(){
    const M = window.WORLDMAP, host = document.getElementById("worldmap");
    if (!M || !host) return;
    const lonMin=6, lonMax=145, latMin=2, latMax=62;
    const px = lon => ((lon - lonMin) / (lonMax - lonMin) * M.W).toFixed(1);
    const py = lat => ((latMax - lat) / (latMax - latMin) * M.H).toFixed(1);
    let grat = "";
    for (let lon=15; lon<=135; lon+=15) grat += `<line x1="${px(lon)}" y1="0" x2="${px(lon)}" y2="${M.H}"/>`;
    for (let lat=15; lat<=60; lat+=15) grat += `<line x1="0" y1="${py(lat)}" x2="${M.W}" y2="${py(lat)}"/>`;
    // label offsets [dx, dy, anchor] — spread the East-Asia cluster
    const LP = { WAW:[11,5,"start"], HKG:[-11,17,"end"], SHA:[12,7,"start"], CGO:[-11,-7,"end"], PEK:[12,-5,"start"] };
    const cities = M.cities.map(c=>{
      const lp = LP[c.short] || [11,5,"start"];
      return `<g class="wm-city" transform="translate(${c.x},${c.y})">`
        + `<circle class="wm-pulse" r="4"/><circle class="wm-dot" r="4.4"/>`
        + `<text x="${lp[0]}" y="${lp[1]}" text-anchor="${lp[2]}">${c.name}</text></g>`;
    }).join("");
    const plane = reduce ? "" :
      `<g class="wm-plane"><path d="M14 0L-8 -7L-2 0L-8 7Z"/>`
      + `<animateMotion dur="18s" repeatCount="indefinite" rotate="auto">`
      + `<mpath xlink:href="#wm-route" href="#wm-route"/></animateMotion></g>`;
    host.innerHTML =
      `<svg class="wm-svg" viewBox="0 0 ${M.W} ${M.H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`
      + `<g class="wm-grat">${grat}</g>`
      + `<path class="wm-land" d="${M.land}"/>`
      + `<path class="wm-route-base" d="${M.routeD}"/>`
      + `<path id="wm-route" class="wm-route-lit" d="${M.routeD}"/>`
      + cities + plane + `</svg>`;
    const lit = host.querySelector("#wm-route");
    const len = lit.getTotalLength();
    lit.style.strokeDasharray = len;
    lit.style.strokeDashoffset = len;
    if (reduce) { lit.style.strokeDashoffset = "0"; return; }
    const io2 = new IntersectionObserver(es => es.forEach(e=>{
      if (e.isIntersecting){ lit.style.transition = "stroke-dashoffset 3.2s ease"; lit.style.strokeDashoffset = "0"; io2.disconnect(); }
    }), { threshold: 0.25 });
    io2.observe(host);
  }

  /* ---------------------------------------------------------- init */
  renderWorldMap();
  onScroll();
  addEventListener("load", onScroll);
})();
