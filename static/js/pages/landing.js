/* ================================================================
   AI NEXT GEN — Quiet Luxury UI Script
   Editorial · Minimal · High-End Interaction
   ================================================================ */
;(function () {
  'use strict';

  // DOM Refs
  const nav = document.querySelector('.g-nav');
  const bgMark = document.querySelector('.hero-bg-mark');

  /* ── SCROLL HEADER CLASS ── */
  function handleScroll() {
    if (!nav) return;
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  /* ── SUBTLE PARALLAX ON HERO MARK ── */
  function handleParallax() {
    if (!bgMark) return;
    const scrollY = window.scrollY;
    // Slow, subtle upward drift
    bgMark.style.transform = `translateY(${scrollY * 0.12}px)`;
  }

  /* ── INTERSECTION OBSERVER FOR REVEALS ── */
  function initRevealAnimation() {
    const reveals = document.querySelectorAll('[data-r]');
    if (!reveals.length) return;

    const observerOptions = {
      root: null, // Viewport
      rootMargin: '0px 0px -8% 0px', // Trigger slightly before full exit
      threshold: 0.05
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('on');
          // Once animated, stop observing this item
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    reveals.forEach(el => observer.observe(el));
  }

  /* ── SMOOTH SCROLL FOR ANCHORS ── */
  function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          const headerOffset = 64; // Adjust based on nav height
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      });
    });
  }

  /* ── INIT ── */
  function init() {
    // Scroll events
    window.addEventListener('scroll', () => {
      handleScroll();
      handleParallax();
    }, { passive: true });

    // Initial triggers
    handleScroll();
    initRevealAnimation();
    initSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
