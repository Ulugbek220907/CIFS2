import { clearNode, escapeHtml } from './dom';
import { QuizApp } from './quiz';
import { trackPageVisit } from './telemetry';
import { scrollToTop } from './smoothScroll';
import { mountOcean } from './oceanBackground';

let activeQuiz: QuizApp | null = null;
let stopOcean: (() => void) | null = null;
let mountedRoot: HTMLElement | null = null;
let currentRoute = '';

function navigate(pathname: string): void {
  if (window.location.pathname === pathname) {
    return;
  }

  window.history.pushState({}, '', pathname);
  renderRoute();
}

function renderHeader(): string {
  return `
    <header class="site-header">
      <a class="brand" href="/" data-nav>
        <img src="/logo.png" alt="CIFS" class="logo-img" decoding="async" />
        <span>CIFS Support</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href="/" data-nav ${window.location.pathname === '/' ? 'aria-current="page"' : ''}>Home</a>
        <a href="/quiz" data-nav ${window.location.pathname === '/quiz' ? 'aria-current="page"' : ''}>Quiz</a>
      </nav>
    </header>
  `;
}

function renderBanner(): string {
  return `
    <section class="leadership-banner">
      <div class="banner-content">
        <span class="leader-badge">Leader</span>
        <span class="leader-name">Founder & Leader: Rustam Fayzullayev</span>
      </div>
    </section>
  `;
}

function renderHome(): string {
  return `
    <canvas class="ocean-bg" aria-hidden="true"></canvas>
    <section class="home-hero">
      <div class="home-hero-card">
        <span class="home-eyebrow">Practice quizzes</span>
        <h1>Welcome to CIFS Support quizium</h1>
        <p class="home-sub">Practise by theme or take a mock exam, and see the right answer straight away.</p>
        <a class="cta-btn" href="/quiz" data-nav>
          Explore Quizzes <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  `;
}

function renderFooter(): string {
  return `
    <footer class="site-footer">
      <div class="footer-credit">
        Developer & Technical Support: <span>Ulug'bek Isoqov</span>
      </div>
      <a
        class="footer-linkedin"
        href="https://www.linkedin.com/in/ulugbekisoqov22"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ulug'bek Isoqov on LinkedIn (opens in a new tab)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/></svg>
        <span>LinkedIn</span>
      </a>
    </footer>
  `;
}

function renderShell(content: string): void {
  if (!mountedRoot) {
    return;
  }

  mountedRoot.innerHTML = `
    ${renderHeader()}
    ${renderBanner()}
    <main class="main-container">
      <div id="view" class="tab-view active">${content}</div>
    </main>
    ${renderFooter()}
  `;
}

async function renderRoute(): Promise<void> {
  if (!mountedRoot) {
    return;
  }

  const pathname = window.location.pathname;
  if (pathname === currentRoute) {
    return;
  }

  const firstRender = currentRoute === '';
  currentRoute = pathname;
  activeQuiz?.destroy();
  activeQuiz = null;
  stopOcean?.();
  stopOcean = null;
  if (!firstRender) {
    scrollToTop();
  }

  if (pathname === '/admin') {
    clearNode(mountedRoot);
    const module = await import('./admin/index');
    module.bootAdmin(mountedRoot);
    return;
  }

  renderShell('');
  const view = mountedRoot.querySelector<HTMLElement>('#view');
  if (!view) {
    return;
  }

  if (pathname === '/quiz') {
    activeQuiz = new QuizApp(view);
    activeQuiz.mount();
    return;
  }

  view.innerHTML = renderHome();
  const oceanCanvas = view.querySelector<HTMLCanvasElement>('.ocean-bg');
  if (oceanCanvas) {
    stopOcean = mountOcean(oceanCanvas);
  }
}

export function bootApp(root: HTMLElement | null): void {
  if (!root) {
    return;
  }

  mountedRoot = root;
  trackPageVisit();
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>('a[data-nav]');
    if (!link) {
      return;
    }

    if (link.origin !== window.location.origin) {
      return;
    }

    event.preventDefault();
    navigate(link.pathname);
  });

  window.addEventListener('popstate', () => {
    void renderRoute();
  });

  void renderRoute();
}
