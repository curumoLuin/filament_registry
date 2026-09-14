/**
 * Walidacja ścieżki przekierowania po zalogowaniu.
 *
 * Czysta funkcja, bez I/O — testowana w tests/unit/safe-redirect.test.ts.
 *
 * Sam warunek `startsWith('/')` nie wystarcza: `//evil.com` zaczyna się od
 * ukośnika, a przeglądarka traktuje to jako adres protokołowo-względny i
 * rozwiązuje na `https://evil.com`. To samo dotyczy wariantu z odwrotnym
 * ukośnikiem, który część przeglądarek normalizuje do tej samej postaci.
 * Otwarte przekierowanie po uwierzytelnieniu jest o tyle nieprzyjemne, że
 * ofiara trafia na obcą stronę dokładnie w momencie, w którym właśnie
 * zaufała ekranowi logowania.
 */
export const DEFAULT_REDIRECT = '/filaments';

/** Znaki sterujące potrafią rozbić nagłówek Location (CR/LF injection). */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof candidate !== 'string') return fallback;

  // Walidacja PRZED normalizacją. Gdyby trim() wykonał się pierwszy, końcowe
  // CR/LF zostałyby po cichu obcięte, a wrogie wejście przepuszczone jako
  // poprawne. Znak sterujący w adresie to sygnał, nie literówka do naprawienia.
  if (hasControlCharacters(candidate)) return fallback;

  const value = candidate.trim();

  // musi być ścieżką względną w obrębie tej aplikacji
  if (!value.startsWith('/')) return fallback;

  // odrzuć adresy protokołowo-względne i ich wariant z odwrotnym ukośnikiem
  if (value.startsWith('//')) return fallback;
  if (value.length > 1 && value[1] === String.fromCharCode(92)) return fallback;

  return value;
}
