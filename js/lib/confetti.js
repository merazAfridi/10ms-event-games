/** Lightweight canvas confetti: one burst, then a gentle continuous fall. Returns a stop() function. */
const TAU = Math.PI * 2;

export function startConfetti(canvas, { colors = ['#f6c453', '#ff6b6b', '#4dabf7', '#51cf66', '#b197fc', '#ffa94d'], burst = 150 } = {}) {
  const g = canvas.getContext('2d');
  const parts = [];
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = performance.now();
  let trickle = 0;

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    const shown = canvas.getBoundingClientRect().width / w || 1; // > 1 on the scaled big-screen stage
    const dpr = Math.min(2, (window.devicePixelRatio || 1) * shown);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const spawn = (x, y, vx, vy) => parts.push({
    x, y, vx, vy,
    rot: Math.random() * TAU,
    spin: (Math.random() - 0.5) * 0.3,
    tilt: Math.random() * TAU,
    size: 6 + Math.random() * 7,
    color: colors[Math.floor(Math.random() * colors.length)],
    round: Math.random() < 0.25,
  });

  for (let i = 0; i < burst; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 7 + Math.random() * 10;
    spawn(w / 2, h * 0.38, Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  const frame = (now) => {
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    trickle += dt;
    while (trickle > 5) {
      trickle -= 5;
      spawn(Math.random() * w, -12, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5);
    }
    g.clearRect(0, 0, w, h);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy = (p.vy + 0.2 * dt) * 0.965;
      p.vx *= 0.975;
      p.tilt += 0.1 * dt;
      p.rot += p.spin * dt;
      p.x += (p.vx + Math.sin(p.tilt) * 0.7) * dt;
      p.y += p.vy * dt;
      if (p.y > h + 20) {
        parts.splice(i, 1);
        continue;
      }
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.scale(1, Math.cos(p.tilt));
      g.fillStyle = p.color;
      if (p.round) {
        g.beginPath();
        g.arc(0, 0, p.size / 2.4, 0, TAU);
        g.fill();
      } else {
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      g.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
