import Lenis from 'lenis';
import { readLocal, removeLocal, writeLocal } from './storage';

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

const SMOOTH_OFF_KEY = 'smooth-scroll-off';

/**
 * A visitor can switch smooth scrolling off for good by opening any page with ?smooth=off (and back on with ?smooth=on).
 * It is the quickest way to tell "is it the smoothing?" from "is it something else?".
 */
function smoothingSwitchedOff(): boolean {
  try {
    const choice = new URLSearchParams(window.location.search).get('smooth');
    if (choice === 'off') writeLocal(SMOOTH_OFF_KEY, true);
    if (choice === 'on') removeLocal(SMOOTH_OFF_KEY);
  } catch {
    // no URL access or storage: carry on
  }
  return readLocal<boolean>(SMOOTH_OFF_KEY) === true;
}

/** Hands scrolling back to the browser completely: nothing of the smoothing is left behind. */
function disableSmoothing(lenis: Lenis): void {
  lenis.destroy();
  window.siteScroll = undefined;
  document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped', 'lenis-scrolling');
}

/**
 * Scrolling must never be worse than the browser's own. This watches the mouse wheel: if the page could scroll in
 * the direction asked, yet repeatedly does not move at all, the smoothing is broken on this device, so it is switched
 * off and the browser's normal scrolling takes over (the very next wheel turn already works).
 */
function watchSmoothing(lenis: Lenis): void {
  let failures = 0;
  const onWheel = (event: WheelEvent): void => {
    if (window.siteScroll !== lenis || lenis.isStopped) return;
    if (event.ctrlKey || Math.abs(event.deltaY) < 1) return; // pinch-zoom or a sideways nudge
    const target = event.target as HTMLElement | null;
    if (target && isInnerScroller(target)) return; // the browser scrolls that one itself
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const before = window.scrollY;
    const down = event.deltaY > 0;
    if (max < 8 || (down && before >= max - 1) || (!down && before <= 0)) return; // nowhere to go
    window.setTimeout(() => {
      if (window.siteScroll !== lenis || lenis.isStopped) return;
      if (Math.abs(window.scrollY - before) < 1 && !lenis.isScrolling) {
        failures += 1;
        if (failures >= 3) {
          window.removeEventListener('wheel', onWheel);
          disableSmoothing(lenis);
        }
      } else {
        failures = 0;
      }
    }, 450);
  };
  window.addEventListener('wheel', onWheel, { passive: true });
}

/**
 * Starts smooth scrolling for mouse and trackpad. Phones and tablets keep the browser's own scrolling (it already has
 * good momentum, and it can never get stuck). Skipped when the visitor asked their device to reduce motion, or opened
 * the site with ?smooth=off.
 */
export function initSmoothScroll(): Lenis | null {
  if (window.siteScroll) {
    return window.siteScroll;
  }
  if (typeof matchMedia !== 'function') {
    return null;
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || smoothingSwitchedOff()) {
    return null;
  }
  // Only devices whose main input is a mouse or trackpad.
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) {
    return null;
  }

  const lenis = new Lenis({
    lerp: 0.12, // smoothness: lower = floatier, higher = tighter
    autoRaf: true,
    smoothWheel: true,
    prevent: isInnerScroller,
  });
  window.siteScroll = lenis;
  watchSmoothing(lenis);
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
