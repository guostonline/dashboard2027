/* ====================================================
   Animated background particles & Cyberpunk Vehicles (Motors & Truks).
   - Floating dots that drift slowly upward + sideways
   - Faint connection lines between nearby dots
   - Reads CSS variables so colors match the active theme
   - Cyberpunk stores distributed across viewport
   - 100 neon vehicles (80 motors + 20 trucks) traveling between stores
   - Pauses on prefers-reduced-motion or when tab hidden
   ==================================================== */
(function () {
  "use strict";

  const canvas = document.getElementById("bg-particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Particle count scales with viewport area
  function particleCount() {
    const area = (window.innerWidth * window.innerHeight) / 1000;
    return Math.max(20, Math.min(60, Math.round(area / 24)));
  }

  // Read theme colors from CSS vars
  function readColors() {
    const s = getComputedStyle(document.body);
    return {
      blue: s.getPropertyValue("--neon-blue").trim() || "#00d4ff",
      pink: s.getPropertyValue("--neon-pink").trim() || "#ff2d55",
      green: s.getPropertyValue("--neon-green").trim() || "#10b981",
      amber: s.getPropertyValue("--neon-amber").trim() || "#f97316",
    };
  }

  function pickColor(colors) {
    const palette = [colors.blue, colors.pink, colors.green, colors.amber];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  // --- Particles Definition ---
  function makeParticle(colors) {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -0.15 - Math.random() * 0.45,
      r: 0.6 + Math.random() * 1.2,
      color: pickColor(colors),
      alpha: 0.20 + Math.random() * 0.50,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  let particles = [];
  let colors = readColors();

  // --- Cyberpunk Stores & Vehicles Definition ---
  let stores = [];
  let vehicles = [];

  function initStores() {
    stores = [
      { id: 0, px: 0.12, py: 0.22, color: colors.blue, label: "NEON HUB" },
      { id: 1, px: 0.88, py: 0.18, color: colors.pink, label: "CYBER MART" },
      { id: 2, px: 0.08, py: 0.78, color: colors.green, label: "ECO DEPT" },
      { id: 3, px: 0.92, py: 0.82, color: colors.amber, label: "HYPER DEPOT" },
      { id: 4, px: 0.50, py: 0.12, color: colors.blue, label: "DRIVE IN" },
      { id: 5, px: 0.48, py: 0.88, color: colors.pink, label: "GRID TERMINAL" }
    ];
  }

  function makeVehicle(idx) {
    const startIdx = Math.floor(Math.random() * stores.length);
    let targetIdx = Math.floor(Math.random() * stores.length);
    while (targetIdx === startIdx) {
      targetIdx = Math.floor(Math.random() * stores.length);
    }

    const startStore = stores[startIdx];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isTruck = idx >= 80; // 80 motors + 20 trucks

    return {
      type: isTruck ? "truk" : "moto",
      x: startStore.px * w,
      y: startStore.py * h,
      speed: isTruck ? (0.55 + Math.random() * 0.45) : (1.2 + Math.random() * 1.6),
      color: pickColor(colors),
      state: Math.random() > 0.4 ? "driving" : "inside",
      insideTimer: Math.floor(Math.random() * 100),
      currentStoreIdx: startIdx,
      targetStoreIdx: targetIdx,
      angle: 0,
      trail: []
    };
  }

  function initVehicles() {
    vehicles = Array.from({ length: 100 }, (_, i) => makeVehicle(i));
  }

  const mouse = { x: null, y: null, active: false };

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });

  window.addEventListener("mouseleave", () => {
    mouse.active = false;
  });

  window.addEventListener("touchstart", (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.active = true;
    }
  });

  window.addEventListener("touchmove", (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.active = true;
    }
  });

  window.addEventListener("touchend", () => {
    mouse.active = false;
  });

  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-seed stores
    initStores();

    // Re-seed particles count
    const target = particleCount();
    if (particles.length === 0) {
      particles = Array.from({ length: target }, () => makeParticle(colors));
    } else if (particles.length < target) {
      while (particles.length < target) particles.push(makeParticle(colors));
    } else if (particles.length > target) {
      particles.length = target;
    }

    // Re-seed vehicles if empty
    if (vehicles.length === 0) {
      initVehicles();
    } else {
      // Adjust coordinates to new size
      const w = window.innerWidth;
      const h = window.innerHeight;
      vehicles.forEach(m => {
        if (m.state === "inside") {
          const store = stores[m.currentStoreIdx];
          m.x = store.px * w;
          m.y = store.py * h;
        }
      });
    }
  }

  function step() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    // --- 1. Draw Stores ---
    stores.forEach(s => {
      const sx = s.px * w;
      const sy = s.py * h;

      ctx.save();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;

      // Base Structure
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - 22, sy - 15, 44, 30);

      // Canopy roof
      ctx.beginPath();
      ctx.moveTo(sx - 27, sy - 15);
      ctx.lineTo(sx + 27, sy - 15);
      ctx.lineTo(sx + 19, sy - 22);
      ctx.lineTo(sx - 19, sy - 22);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(s.color, 0.15);
      ctx.fill();
      ctx.stroke();

      // Pillars
      ctx.strokeRect(sx - 17, sy, 4, 15);
      ctx.strokeRect(sx + 13, sy, 4, 15);

      // Door
      ctx.strokeRect(sx - 5, sy + 2, 10, 13);

      // Label Above
      ctx.font = "8px monospace";
      ctx.fillStyle = s.color;
      ctx.textAlign = "center";
      ctx.fillText(s.label, sx, sy - 28);

      ctx.restore();
    });

    // --- 2. Update + Draw Vehicles ---
    vehicles.forEach(m => {
      const tx = stores[m.targetStoreIdx].px * w;
      const ty = stores[m.targetStoreIdx].py * h;

      if (m.state === "driving") {
        const dx = tx - m.x;
        const dy = ty - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 6) {
          m.state = "inside";
          m.x = tx;
          m.y = ty;
          m.currentStoreIdx = m.targetStoreIdx;
          m.insideTimer = Math.floor(60 + Math.random() * 120);
          m.trail = [];
        } else {
          m.angle = Math.atan2(dy, dx);
          m.x += Math.cos(m.angle) * m.speed;
          m.y += Math.sin(m.angle) * m.speed;

          // Track trail
          m.trail.push({ x: m.x, y: m.y });
          const maxTrail = m.type === "truk" ? 6 : 4;
          if (m.trail.length > maxTrail) m.trail.shift();

          // Draw trail
          if (m.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(m.trail[0].x, m.trail[0].y);
            for (let k = 1; k < m.trail.length; k++) {
              ctx.lineTo(m.trail[k].x, m.trail[k].y);
            }
            ctx.strokeStyle = hexToRgba(m.color, m.type === "truk" ? 0.12 : 0.20);
            ctx.lineWidth = m.type === "truk" ? 2.5 : 1.2;
            ctx.stroke();
          }

          // Draw vehicle body
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(m.angle);

          if (m.type === "moto") {
            // --- MOTORCYCLE DRAWING ---
            // Headlight cone
            ctx.beginPath();
            ctx.moveTo(3, 0);
            ctx.lineTo(16, -5);
            ctx.lineTo(16, 5);
            ctx.closePath();
            ctx.fillStyle = hexToRgba(m.color, 0.08);
            ctx.fill();

            // Wheels
            ctx.beginPath();
            ctx.arc(-5, 2, 2, 0, Math.PI * 2);
            ctx.arc(5, 2, 2, 0, Math.PI * 2);
            ctx.fillStyle = "#0f172a";
            ctx.fill();
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Body frame
            ctx.beginPath();
            ctx.moveTo(-5, 2);
            ctx.lineTo(-2, -2);
            ctx.lineTo(3, -2);
            ctx.lineTo(5, 2);
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Rider
            ctx.beginPath();
            ctx.moveTo(-3, -2);
            ctx.lineTo(-1, -5);
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          } else {
            // --- TRUCK DRAWING ---
            // Headlight cone
            ctx.beginPath();
            ctx.moveTo(11, 0);
            ctx.lineTo(26, -8);
            ctx.lineTo(26, 8);
            ctx.closePath();
            ctx.fillStyle = hexToRgba(m.color, 0.08);
            ctx.fill();

            // Trailer cargo box (back)
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(-12, -5, 16, 10);
            ctx.fillStyle = hexToRgba(m.color, 0.12);
            ctx.fillRect(-12, -5, 16, 10);

            // Cabin (front)
            ctx.strokeRect(4, -4, 6, 8);
            ctx.fillStyle = hexToRgba(m.color, 0.05);
            ctx.fillRect(4, -4, 6, 8);

            // Connector
            ctx.strokeRect(10, -2, 2, 4);

            // Wheels (3 sets of cyber wheels)
            ctx.beginPath();
            ctx.arc(-8, 5, 2.2, 0, Math.PI * 2);
            ctx.arc(0, 5, 2.2, 0, Math.PI * 2);
            ctx.arc(7, 5, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = "#0f172a";
            ctx.fill();
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }

          ctx.restore();
        }
      } else if (m.state === "inside") {
        m.insideTimer--;
        if (m.insideTimer <= 0) {
          let next = Math.floor(Math.random() * stores.length);
          while (next === m.currentStoreIdx) {
            next = Math.floor(Math.random() * stores.length);
          }
          m.targetStoreIdx = next;
          m.state = "driving";
        }
      }
    });

    // --- 3. Update + Draw Particles ---
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      
      if (mouse.active) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150;
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * force * 1.5;
          p.y += Math.sin(angle) * force * 1.5;
        }
      }

      p.pulse += 0.08;

      if (p.y < -10) p.y = h + 10;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      const a = p.alpha * (0.75 + 0.25 * Math.sin(p.pulse));

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      grad.addColorStop(0, hexToRgba(p.color, a));
      grad.addColorStop(1, hexToRgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = hexToRgba(p.color, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 4. Connection Lines ---
    const maxDist = 110;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDist * maxDist) {
          const d = Math.sqrt(d2);
          const alpha = (1 - d / maxDist) * 0.15;
          ctx.strokeStyle = hexToRgba(a.color, alpha);
          ctx.lineWidth = 0.45;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    if (mouse.active) {
      const maxMouseDist = 160;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxMouseDist) {
          const alpha = (1 - dist / maxMouseDist) * 0.24;
          ctx.strokeStyle = hexToRgba(p.color, alpha);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }
  }

  function hexToRgba(hex, alpha) {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return `rgba(0, 212, 255, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let raf = null;
  function loop() {
    step();
    raf = requestAnimationFrame(loop);
  }

  // Override prefers-reduced-motion restriction to force play as explicitly requested by user
  function start() {
    if (raf) return;
    loop();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // React to theme changes
  const themeObserver = new MutationObserver(() => {
    colors = readColors();
    initStores();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // Boot
  resize();
  start();
})();
