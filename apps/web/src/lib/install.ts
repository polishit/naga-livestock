import { useEffect, useState } from 'react';

/** Chrome / Edge / Android's install prompt event (not yet in the TypeScript DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser may offer installation before React has mounted, so the event is caught here at load.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Running as an installed app (home-screen icon) rather than in a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad Safari has no install prompt: the user adds it with Share → Add to Home Screen. */
export function isIOS() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Whether the app can be installed here, and a function that shows the browser's install prompt. */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const standalone = isStandalone() || installed;
  return {
    standalone,
    canPrompt: !standalone && !!deferred,
    ios: !standalone && isIOS(),
    /** Show the browser's install prompt; resolves true if the user accepted. */
    async install() {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      notify();
      return outcome === 'accepted';
    },
  };
}

const DISMISS_KEY = 'nlm-install-dismissed';
const REMIND_AFTER_DAYS = 14;

/** The phone banner was dismissed recently ("Not now" hides it for two weeks). */
export function installDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < REMIND_AFTER_DAYS * 86400_000;
  } catch {
    return false;
  }
}
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}