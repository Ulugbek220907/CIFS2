import crypto from 'node:crypto';

/**
 * Simulates a browser tab / session context, including sessionStorage,
 * route location, referrer, and tab life-cycle operations.
 */
export class BrowserSession {
  constructor(options = {}) {
    this.sessionStorage = new Map();
    this.route = options.route || '/';
    this.referrer = options.referrer || '';
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';
    this.offline = !!options.offline;
  }

  /**
   * Emulates window.sessionStorage.getItem
   */
  getItem(key) {
    return this.sessionStorage.get(key) ?? null;
  }

  /**
   * Emulates window.sessionStorage.setItem
   */
  setItem(key, value) {
    this.sessionStorage.set(key, String(value));
  }

  /**
   * Emulates window.sessionStorage.removeItem
   */
  removeItem(key) {
    this.sessionStorage.delete(key);
  }

  /**
   * Emulates window.sessionStorage.clear
   */
  clearStorage() {
    this.sessionStorage.clear();
  }

  /**
   * Navigate to a new route in the SPA
   */
  navigate(newRoute) {
    this.route = newRoute;
  }

  /**
   * Simulate a page reload (sessionStorage is preserved, route stays same)
   */
  reload() {
    // Retains sessionStorage, route, and referrer
    return this;
  }

  /**
   * Simulate opening a fresh browser tab/window (new empty sessionStorage)
   */
  static createNewTab(options = {}) {
    return new BrowserSession(options);
  }
}
