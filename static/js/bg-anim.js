/* ====================================================
   Animated background particles.
   - Floating dots that drift slowly upward + sideways
   - Faint connection lines between nearby dots
   - Reads CSS variables so colors match the active theme
   - Pauses on prefers-reduced-motion
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
    return Math.max(28, Math.min(90, Math.round(area / 16)));
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

  function makeParticle(colors) {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -0.20 - Math.random() * 0.55, // drift upward faster
      r: 0.6 + Math.random() * 1.4,
      color: pickColor(colors),
      alpha: 0.25 + Math.random() * 0.55,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  let particles = [];
  let colors = readColors();

  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Re-seed particle count to match new area
    const target = particleCount();
    if (particles.length === 0) {
      particles = Array.from({ length: target }, () => makeParticle(colors));
    } else if (particles.length < target) {
      while (particles.length < target) particles.push(makeParticle(colors));
    } else if (particles.length > target) {
      particles.length = target;
    }
  }

  function step() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    // Update + draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.10;

      // Wrap around edges so the field stays populated
      if (p.y < -10) p.y = h + 10;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      const a = p.alpha * (0.75 + 0.25 * Math.sin(p.pulse));

      // Soft glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      grad.addColorStop(0, hexToRgba(p.color, a));
      grad.addColorStop(1, hexToRgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
      ctx.fill();

      // Hard core
      ctx.fillStyle = hexToRgba(p.color, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw connection lines between nearby particles (O(n^2) but n is small)
    const maxDist = 120;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDist * maxDist) {
          const d = Math.sqrt(d2);
          const alpha = (1 - d / maxDist) * 0.18;
          ctx.strokeStyle = hexToRgba(a.color, alpha);
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
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

  function start() {
    if (raf) return;
    if (reducedMotion) {
      // Still draw one frame so the canvas isn't blank
      step();
      return;
    }
    loop();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // React to theme changes
  const themeObserver = new MutationObserver(() => {
    colors = readColors();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // Resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  // Pause when tab is hidden (saves CPU)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // Boot
  resize();
  start();
})();
