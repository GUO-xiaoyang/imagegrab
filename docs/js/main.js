/**
 * 图提取 ImageGrab · 官网交互脚本
 * 纯原生 JS，无任何外部依赖。包含：
 *   1. 导航栏吸顶态切换
 *   2. 移动端汉堡菜单
 *   3. 滚动进入视口的淡入上移动画（IntersectionObserver）
 *   4. 导航当前区块高亮（滚动监听）
 *   5. 平滑锚点滚动（带吸顶偏移）
 *   6. 动态更新版权年份
 */

(() => {
  'use strict';

  const navbar = document.getElementById('navbar');
  const navLinks = document.getElementById('nav-links');
  const navToggle = document.getElementById('nav-toggle');
  const yearEl = document.getElementById('year');

  // ---------------------------------------------------------------------------
  // 1. 导航栏吸顶态：滚动超过 20px 时加毛玻璃与阴影
  // ---------------------------------------------------------------------------
  const STUCK_THRESHOLD = 20;

  function updateNavbarState() {
    if (!navbar) return;
    navbar.classList.toggle('is-stuck', window.scrollY > STUCK_THRESHOLD);
  }

  // rAF 节流，避免滚动时高频触发
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateNavbarState();
      updateActiveLink();
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  updateNavbarState();

  // ---------------------------------------------------------------------------
  // 2. 移动端汉堡菜单
  // ---------------------------------------------------------------------------
  function closeMenu() {
    if (!navLinks || !navToggle) return;
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.setAttribute('aria-label', isOpen ? '关闭菜单' : '打开菜单');
    });

    // 点击菜单里的链接后自动收起
    navLinks.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeMenu();
    });

    // 点击页面其它区域收起
    document.addEventListener('click', (e) => {
      if (!navLinks.classList.contains('is-open')) return;
      if (e.target.closest('#nav-links') || e.target.closest('#nav-toggle')) return;
      closeMenu();
    });

    // Esc 收起
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    // 回到桌面宽度时复位
    const mq = window.matchMedia('(min-width: 768px)');
    const handleMq = (ev) => {
      if (ev.matches) closeMenu();
    };
    if (mq.addEventListener) mq.addEventListener('change', handleMq);
    else mq.addListener(handleMq);
  }

  // ---------------------------------------------------------------------------
  // 3. 滚动淡入动画
  // ---------------------------------------------------------------------------
  const revealEls = Array.from(document.querySelectorAll('.reveal'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);   // 只触发一次
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    revealEls.forEach((el, i) => {
      // 首屏元素给一点错峰延迟，视觉更自然
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 70}ms`;
      io.observe(el);
    });
  } else {
    // 不支持 IntersectionObserver 时直接显示
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // ---------------------------------------------------------------------------
  // 4. 导航当前区块高亮
  // ---------------------------------------------------------------------------
  /** 参与高亮的区块 id 与对应链接 */
  const spyMap = [
    { id: 'intro', link: document.querySelector('.nav-link[href="#intro"]') },
    { id: 'features', link: document.querySelector('.nav-link[href="#features"]') },
    { id: 'install', link: document.querySelector('.nav-link[href="#install"]') }
  ].filter((item) => item.link && document.getElementById(item.id));

  function updateActiveLink() {
    if (!spyMap.length) return;

    // 以视口上方 1/3 处为判定线
    const line = window.scrollY + window.innerHeight * 0.33;
    let activeId = null;

    for (const item of spyMap) {
      const section = document.getElementById(item.id);
      if (!section) continue;
      const top = section.offsetTop;
      const bottom = top + section.offsetHeight;
      if (line >= top && line < bottom) activeId = item.id;
    }

    spyMap.forEach((item) => {
      item.link.classList.toggle('is-active', item.id === activeId);
    });
  }

  updateActiveLink();

  // ---------------------------------------------------------------------------
  // 5. 平滑锚点滚动（为固定导航预留偏移）
  // ---------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    const navHeight = navbar ? navbar.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 12;

    window.scrollTo({
      top: Math.max(top, 0),
      behavior: 'smooth'
    });

    // 同步更新地址栏，便于分享定位
    if (history.replaceState) history.replaceState(null, '', hash);
  });

  // ---------------------------------------------------------------------------
  // 6. 版权年份
  // ---------------------------------------------------------------------------
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
