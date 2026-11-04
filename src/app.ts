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
    <div class="ornament-strip" aria-hidden="true"></div>
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
        <h1>Welcome to CIFS Support quizium</h1>
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
        Developer & Technical Support:
        <a
          class="footer-name"
          href="https://www.linkedin.com/in/ulugbekisoqov22"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ulug'bek Isoqov on LinkedIn (opens in a new tab)"
          title="Open Ulug'bek Isoqov's LinkedIn"
        >Ulug'bek Isoqov</a>
      </div>
    </footer>
    <div class="ornament-strip ornament-strip-end" aria-hidden="true"></div>
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
