(function () {
  const $ = (id) => document.getElementById(id);

  function initNavScroll() {
    const nav = document.querySelector('.navbar') || document.querySelector('nav');
    if (!nav) return;

    const onScroll = () => {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle') || document.querySelector('.mobile-nav-toggle') || document.querySelector('[data-nav-toggle]');
    const menu = document.querySelector('.nav-menu') || document.querySelector('.nav-links') || document.querySelector('.mobile-nav');

    if (toggle && menu) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('active');
        toggle.classList.toggle('active');
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) {
          menu.classList.remove('active');
          toggle.classList.remove('active');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function initLogout() {
    const logoutBtns = document.querySelectorAll('.logout-btn, [data-action="logout"]');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    });
  }

  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal, .fade-in, .slide-up, [data-reveal]');
    if (!reveals.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed', 'visible');
            const delay = entry.target.dataset.revealDelay || entry.dataset.delay;
            if (delay) {
              entry.target.style.transitionDelay = `${parseInt(delay)}ms`;
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach((el) => observer.observe(el));
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    const duration = parseInt(el.dataset.countDuration, 10) || 2000;
    const suffix = el.dataset.countSuffix || '';
    const prefix = el.dataset.countPrefix || '';
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      el.textContent = prefix + current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          const navHeight = document.querySelector('.navbar')?.offsetHeight || 0;
          const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  async function initAuth() {
    await Auth.getSession();
    Auth.updateNav();
    Auth.updateAdminNav();
  }

  function initStickyHeader() {
    const header = document.querySelector('.hero, .page-header, .page-hero');
    if (!header) return;

    const handleScroll = () => {
      if (window.scrollY > 100) {
        header.classList.add('header-scrolled');
      } else {
        header.classList.remove('header-scrolled');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  function initTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(el => {
      const text = el.dataset.tooltip;
      const tip = document.createElement('div');
      tip.className = 'tooltip-popup';
      tip.textContent = text;
      tip.style.cssText = `
        position: absolute; bottom: calc(100% + 8px); left: 50%;
        transform: translateX(-50%); padding: 6px 12px;
        background: rgba(15,15,25,0.95); color: #e2e8f0;
        font-size: 12px; border-radius: 6px; white-space: nowrap;
        pointer-events: none; opacity: 0; transition: opacity 0.2s;
        z-index: 9999; backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.1);
      `;
      el.style.position = 'relative';
      el.appendChild(tip);

      el.addEventListener('mouseenter', () => { tip.style.opacity = '1'; });
      el.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initNavScroll();
    initMobileNav();
    initLogout();
    initScrollReveal();
    initCounters();
    initSmoothScroll();
    initStickyHeader();
    initTooltips();
    initAuth();
  });
})();
