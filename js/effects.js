// Small visual effects. Everything here is skipped for people who prefer reduced motion.

export function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Short confetti burst on a full-screen canvas that removes itself when done. */
export function confetti({ count = 140, duration = 2600 } = {}) {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    const colors = ["#4f46e5", "#0f766e", "#f59e0b", "#ef4444", "#22c55e", "#38bdf8"];
    const pieces = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (-Math.random() * 12 - 4) * dpr,
      size: (6 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.35 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < duration) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/** Count a number up from 0 inside `el`, e.g. "0%" to "80%". */
export function countUp(el, to, { duration = 900, suffix = "" } = {}) {
  if (prefersReducedMotion() || to === 0) {
    el.textContent = `${to}${suffix}`;
    return;
  }
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(to * eased)}${suffix}`;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
