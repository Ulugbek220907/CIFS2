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
    // A slider (the audio seek bar) must keep its own drag.
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') {
      return true;
    }
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      return true;
    }
  }
  return false;
}

/**
 * Lenis warns that its touch mode misbehaves on iOS before 16, so those phones keep the browser's own scrolling
 * (which has good momentum of its own). Everything else gets the same eased glide as desktop.
 */
function touchSmoothingSupported(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const ios = /iP(hone|ad|od)/.test(ua) ? /OS (\d+)[_.]/.exec(ua) : null;
  return !ios || Number(ios[1]) >= 16;
}

/** Starts smooth scrolling once. Skipped when the visitor asked their device to reduce motion. */
export function initSmoothScroll(): Lenis | null {
  if (window.siteScroll) {
    return window.siteScroll;
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  // A phone or tablet: the finger drives the scrolling, so touch smoothing is what makes it glide.
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (touch && !touchSmoothingSupported()) {
    return null;
  }

  const lenis = new Lenis({
    lerp: 0.1, // smoothness: lower = floatier, higher = tighter
    autoRaf: true,
    smoothWheel: true,
    prevent: isInnerScroller,
    ...(touch
      ? {
          syncTouch: true,
          syncTouchLerp: 0.12, // a little tighter than a mouse wheel: a finger should feel attached
          touchInertiaMultiplier: 30, // how far the page keeps gliding after the finger lifts
        }
      : {}),
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
