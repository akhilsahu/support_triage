import type { NearbyArea } from '../api/nearby';

export interface BrowserLocation extends NearbyArea {
  accuracy_m: number;
  captured_at: string;
}

/** Automatic lookup never prompts; an explicit fallback button may request permission. */
export function readBrowserLocation(allowPrompt: boolean): Promise<BrowserLocation | null> {
  return new Promise(resolve => {
    let finished = false;
    const finish = (value: BrowserLocation | null = null) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(), allowPrompt ? 30000 : 4500);
    const locate = () => {
      if (finished || !navigator.geolocation) { finish(); return; }
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || !Number.isFinite(position.timestamp)) {
          finish(); return;
        }
        finish({ latitude, longitude, accuracy_m: accuracy, captured_at: new Date(position.timestamp).toISOString() });
      }, () => finish(), { timeout: 4000, maximumAge: 60000, enableHighAccuracy: false });
    };
    const start = async () => {
      try {
        if (allowPrompt) { locate(); return; }
        if (!navigator.permissions) { finish(); return; }
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'granted') locate(); else finish();
      } catch { finish(); }
    };
    void start();
  });
}
