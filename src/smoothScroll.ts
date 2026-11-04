import Lenis from 'lenis';

declare global {
  interface Window {
    siteScroll?: Lenis;
  }
}

/**
 * True for elements that scroll on their own (modals, text boxes, lists). Wheel events over them
 * keep the browser's normal scrolling instead of being smoothed with the page.
 */
function isInnerScroller(node: HTMLElement): boolean {
  for (let el: HTMLElement | null = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.hasAttribute('data-lenis-prevent') || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      return true;
    }
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      return true;
    }
  }
  return false;
}

/** Starts smooth scrolling once. Skipped when the visitor asked their device to reduce motion. */
export function initSmoothScroll(): Lenis | null {
  if (window.siteScroll) {
    return window.siteScroll;
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  // Touch screens keep native scrolling (it is smoother there), so Lenis would only burn a frame loop for nothing.
  if (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches) {
    return null;
  }

  const lenis = new Lenis({
    lerp: 0.1, // smoothness: lower = floatier, higher = tighter
    autoRaf: true,
    smoothWheel: true,
    prevent: isInnerScroller,
  });
  window.siteScroll = lenis;
  return lenis;
}

/** Jumps to the top of the page, for when the screen changes (new page, next step of the quiz). */
export function scrollToTop(): void {
  if (window.siteScroll) {
    window.siteScroll.scrollTo(0, { immediate: true });
  } else {
    window.scrollTo(0, 0);
  }
}
