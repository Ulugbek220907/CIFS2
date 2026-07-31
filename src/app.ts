import { clearNode, escapeHtml } from './dom';
import { QuizApp } from './quiz';

let activeQuiz: QuizApp | null = null;
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
        <img src="/logo.svg" alt="CIFS" width="36" height="36" decoding="async" />
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
    <section class="home-hero">
      <h1>Welcome to CIFS Support quizium</h1>
      <a class="cta-btn" href="/quiz" data-nav>
        Explore Quizzes <span aria-hidden="true">→</span>
      </a>
    </section>
  `;
}

function renderFooter(): string {
  return `
    <footer class="site-footer">
      <div class="footer-credit">
        Developer & Technical Support: <span>Ulug'bek Isoqov</span>
      </div>
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

  currentRoute = pathname;
  activeQuiz?.destroy();
  activeQuiz = null;

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
}

export function bootApp(root: HTMLElement | null): void {
  if (!root) {
    return;
  }

  mountedRoot = root;
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
