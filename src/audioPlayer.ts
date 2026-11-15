import { escapeHtml } from './dom';
import { formatClock } from './acsModel';

// A small audio player in the site's style: play/pause, a seek bar, elapsed/total time, 10-second skips and a speed
// button. renderAudioPlayer() returns the markup; mountAudioPlayer() brings it to life and returns a cleanup function.

const SPEEDS: readonly number[] = [1, 1.25, 1.5, 0.75];
const SEEK_STEPS = 1000;

const PLAY_ICON =
  '<svg class="acs-icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.52.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2Z"/></svg>';
const PAUSE_ICON =
  '<svg class="acs-icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>';
const SPINNER = '<span class="acs-icon-wait" aria-hidden="true"></span>';

export function renderAudioPlayer(src: string, label: string): string {
  return `
    <div class="acs-player" data-player data-state="idle">
      <audio preload="metadata" src="${escapeHtml(src)}" data-label="${escapeHtml(label)}"></audio>
      <div class="acs-player-row">
        <button type="button" class="acs-play" data-player-play aria-label="Play ${escapeHtml(label)}">
          ${PLAY_ICON}${PAUSE_ICON}${SPINNER}
        </button>
        <div class="acs-player-track">
          <input class="acs-seek" data-player-seek type="range" min="0" max="${SEEK_STEPS}" step="1" value="0" disabled aria-label="Seek" />
          <div class="acs-times" aria-hidden="true"><span data-player-current>0:00</span><span data-player-duration>--:--</span></div>
        </div>
      </div>
      <div class="acs-player-tools">
        <button type="button" class="acs-tool" data-player-skip="-10" aria-label="Back 10 seconds">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></svg>
          <span>10s</span>
        </button>
        <button type="button" class="acs-tool" data-player-skip="10" aria-label="Forward 10 seconds">
          <span>10s</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 9 16 9"/></svg>
        </button>
        <button type="button" class="acs-tool acs-speed" data-player-speed aria-label="Playback speed 1 times">1×</button>
      </div>
      <p class="acs-player-status" data-player-status role="status" aria-live="polite"></p>
    </div>
  `;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/** Wires up a player rendered by renderAudioPlayer(). Returns a function that stops it and frees the audio. */
export function mountAudioPlayer(root: HTMLElement): () => void {
  const audio = root.querySelector<HTMLAudioElement>('audio');
  const playButton = root.querySelector<HTMLButtonElement>('[data-player-play]');
  const seek = root.querySelector<HTMLInputElement>('[data-player-seek]');
  const currentEl = root.querySelector<HTMLElement>('[data-player-current]');
  const durationEl = root.querySelector<HTMLElement>('[data-player-duration]');
  const speedButton = root.querySelector<HTMLButtonElement>('[data-player-speed]');
  const statusEl = root.querySelector<HTMLElement>('[data-player-status]');
  if (!audio || !playButton || !seek || !currentEl || !durationEl || !speedButton || !statusEl) {
    return () => undefined;
  }

  const label = audio.dataset.label ?? 'Recording';
  let state: PlayerState = 'idle';
  let scrubbing = false;
  let raf = 0;
  let speedIndex = 0;
  let wantPlay = false;
  let disposed = false;

  const setState = (next: PlayerState): void => {
    state = next;
    root.dataset.state = next;
    const busy = next === 'loading';
    playButton.setAttribute('aria-busy', String(busy));
    playButton.setAttribute('aria-label', `${next === 'playing' ? 'Pause' : 'Play'} ${label}`);
  };

  const hasDuration = (): boolean => Number.isFinite(audio.duration) && audio.duration > 0;

  const paint = (): void => {
    const duration = hasDuration() ? audio.duration : 0;
    const time = scrubbing ? (Number(seek.value) / SEEK_STEPS) * duration : audio.currentTime;
    currentEl.textContent = formatClock(time);
    durationEl.textContent = duration ? formatClock(duration) : '--:--';
    if (!scrubbing) seek.value = duration ? String(Math.round((audio.currentTime / duration) * SEEK_STEPS)) : '0';
    seek.style.setProperty('--p', `${duration ? (time / duration) * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', duration ? `${formatClock(time)} of ${formatClock(duration)}` : formatClock(time));
  };

  const tick = (): void => {
    paint();
    if (!audio.paused && !disposed) raf = requestAnimationFrame(tick);
  };

  const showStatus = (message: string, withRetry = false): void => {
    statusEl.textContent = message;
    if (withRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'acs-retry';
      retry.dataset.playerRetry = '';
      retry.textContent = 'Try again';
      statusEl.append(' ', retry);
    }
  };

  const play = (): void => {
    wantPlay = true;
    const attempt = audio.play();
    if (attempt) {
      attempt.catch((error: unknown) => {
        // A brand-new load interrupting this play() is normal; anything else (blocked, unsupported) is shown.
        if ((error as DOMException)?.name === 'AbortError') return;
        wantPlay = false;
        if (state !== 'error') setState('paused');
      });
    }
  };

  const onPlayClick = (): void => {
    if (state === 'error') {
      retry();
      return;
    }
    if (audio.paused || audio.ended) play();
    else {
      wantPlay = false;
      audio.pause();
    }
  };

  const retry = (): void => {
    showStatus('');
    setState('loading');
    audio.load();
    if (wantPlay) play();
  };

  const skip = (seconds: number): void => {
    if (!hasDuration()) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + seconds));
    paint();
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-player-play]')) return onPlayClick();
    if (target.closest('[data-player-retry]')) return retry();
    const skipButton = target.closest<HTMLElement>('[data-player-skip]');
    if (skipButton) return skip(Number(skipButton.dataset.playerSkip));
    if (target.closest('[data-player-speed]')) {
      speedIndex = (speedIndex + 1) % SPEEDS.length;
      const rate = SPEEDS[speedIndex];
      audio.playbackRate = rate;
      speedButton.textContent = `${rate}×`;
      speedButton.setAttribute('aria-label', `Playback speed ${rate} times`);
    }
  };

  const onSeekInput = (): void => {
    scrubbing = true;
    paint();
  };
  const onSeekChange = (): void => {
    if (hasDuration()) audio.currentTime = (Number(seek.value) / SEEK_STEPS) * audio.duration;
    scrubbing = false;
    paint();
  };

  const onMeta = (): void => {
    seek.disabled = !hasDuration();
    if (state === 'loading' || state === 'idle') setState(audio.paused ? 'paused' : 'playing');
    showStatus('');
    paint();
  };

  const onPlaying = (): void => {
    setState('playing');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };
  const onPause = (): void => {
    if (audio.ended) return;
    if (state !== 'error') setState('paused');
    cancelAnimationFrame(raf);
    paint();
  };
  const onEnded = (): void => {
    wantPlay = false;
    setState('ended');
    cancelAnimationFrame(raf);
    paint();
  };
  const onWaiting = (): void => {
    if (!audio.paused) setState('loading');
  };
  const onError = (): void => {
    if (disposed) return;
    cancelAnimationFrame(raf);
    setState('error');
    showStatus('This recording could not be loaded. Check your connection.', true);
  };

  const listeners: Array<[EventTarget, string, EventListener]> = [
    [root, 'click', onClick],
    [seek, 'input', onSeekInput],
    [seek, 'change', onSeekChange],
    [audio, 'loadedmetadata', onMeta],
    [audio, 'durationchange', onMeta],
    [audio, 'timeupdate', paint],
    [audio, 'playing', onPlaying],
    [audio, 'pause', onPause],
    [audio, 'ended', onEnded],
    [audio, 'waiting', onWaiting],
    [audio, 'error', onError],
  ];
  for (const [target, name, handler] of listeners) target.addEventListener(name, handler);

  // Lock-screen and headset controls on phones.
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  if (session) {
    try {
      session.metadata = new MediaMetadata({ title: label, artist: 'CIFS Support' });
      session.setActionHandler('play', play);
      session.setActionHandler('pause', () => audio.pause());
      session.setActionHandler('seekbackward', () => skip(-10));
      session.setActionHandler('seekforward', () => skip(10));
    } catch {
      // Not every browser supports every action.
    }
  }

  // Start as "paused", not "loading": iOS Safari does not preload audio, so nothing would ever clear a spinner.
  setState('paused');
  paint();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const [target, name, handler] of listeners) target.removeEventListener(name, handler);
    audio.pause();
    audio.removeAttribute('src');
    audio.load(); // stop downloading
    if (session) {
      try {
        session.metadata = null;
        for (const action of ['play', 'pause', 'seekbackward', 'seekforward'] as const) session.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }
  };
}
