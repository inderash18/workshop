/* ============================================
   LANDING — Particle animation + hero effects
   ============================================ */

(function() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, particles, animId;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = canvas.width = rect.width;
    height = canvas.height = rect.height;
  }

  function createParticles() {
    const count = Math.min(Math.floor((width * height) / 18000), 80);
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    /* Draw connections */
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.12;
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    /* Draw particles */
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`;
      ctx.fill();

      /* Move */
      p.x += p.vx;
      p.y += p.vy;

      /* Wrap */
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;
    }

    animId = requestAnimationFrame(draw);
  }

  function init() {
    resize();
    createParticles();
    draw();
  }

  /* Debounced resize */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cancelAnimationFrame(animId);
      init();
    }, 200);
  });

  /* Reduce motion check */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  init();
})();
