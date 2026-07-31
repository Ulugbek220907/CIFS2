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
        <span>CIFS</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href="/" data-nav ${window.location.pathname === '/' ? 'aria-current="page"' : ''}>Home</a>
        <a href="/quiz" data-nav ${window.location.pathname === '/quiz' ? 'aria-current="page"' : ''}>Quiz</a>
      </nav>
    </header>
  `;
}

function renderHome(): string {
  return `
    <section class="home-shell panel">
      <p class="home-motto">Just Practice</p>
      <a class="button primary" href="/quiz" data-nav>Start quiz</a>
    </section>
  `;
}

function renderShell(content: string): void {
  if (!mountedRoot) {
    return;
  }

  mountedRoot.innerHTML = `
    ${renderHeader()}
    <main class="app-main">
      <div class="app-frame">
        <div id="view">${content}</div>
      </div>
    </main>
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
