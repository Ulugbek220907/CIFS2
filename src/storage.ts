const prefix = 'pulse-quiz:';

export function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSession<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode or tight quota conditions.
  }
}

export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(prefix + key);
  } catch {
    // Ignore storage failures.
  }
}
