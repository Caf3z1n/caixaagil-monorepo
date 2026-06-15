"use client";

let scrollAnimationFrame: number | null = null;

export function smoothScrollToSection(id: string) {
  const section = document.getElementById(id);

  if (!section) {
    return false;
  }

  if (scrollAnimationFrame !== null) {
    window.cancelAnimationFrame(scrollAnimationFrame);
  }

  const startY = window.scrollY;
  const scrollMarginTop = Number.parseFloat(window.getComputedStyle(section).scrollMarginTop) || 0;
  const targetY = Math.max(0, window.scrollY + section.getBoundingClientRect().top - scrollMarginTop);
  const distance = targetY - startY;
  const duration = Math.min(980, Math.max(520, Math.abs(distance) * 0.42));
  const startedAt = window.performance.now();
  const easeOutQuint = (value: number) => 1 - Math.pow(1 - value, 5);

  function animate(now: number) {
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutQuint(progress);

    window.scrollTo(0, startY + distance * eased);

    if (progress < 1) {
      scrollAnimationFrame = window.requestAnimationFrame(animate);
    } else {
      scrollAnimationFrame = null;
    }
  }

  scrollAnimationFrame = window.requestAnimationFrame(animate);
  return true;
}

export function smoothScrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");

  if (!id) {
    return false;
  }

  return smoothScrollToSection(id);
}
