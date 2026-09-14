import { describe, expect, it } from 'vitest';
import { DEFAULT_REDIRECT, safeRedirectPath } from '../../src/lib/safe-redirect';

/**
 * Ryzyko adresowane - patrz context/foundation/test-plan.md
 *   R-09 otwarte przekierowanie po zalogowaniu
 */

describe('R-09 · przekierowanie po zalogowaniu nie wyprowadza poza aplikacje', () => {
  it('przepuszcza zwykla sciezke wewnetrzna', () => {
    expect(safeRedirectPath('/projects')).toBe('/projects');
    expect(safeRedirectPath('/filaments?ok=1')).toBe('/filaments?ok=1');
  });

  it('odrzuca adres protokolowo-wzgledny', () => {
    // przegladarka rozwiaze to jako https://evil.example, a startsWith('/') przepuszcza
    expect(safeRedirectPath('//evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('//evil.example/phish')).toBe(DEFAULT_REDIRECT);
  });

  it('odrzuca wariant z odwrotnym ukosnikiem', () => {
    expect(safeRedirectPath('/\\evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('odrzuca adres bezwzgledny', () => {
    expect(safeRedirectPath('https://evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('http://evil.example')).toBe(DEFAULT_REDIRECT);
  });

  it('odrzuca znaki sterujace, ktore moglyby rozbic naglowek Location', () => {
    expect(safeRedirectPath('/projects\nLocation: https://evil.example')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('/projects\r\n')).toBe(DEFAULT_REDIRECT);
  });

  it('odrzuca wejscie puste, nie-tekstowe i bez wiodacego ukosnika', () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('projects')).toBe(DEFAULT_REDIRECT);
  });

  it('pozwala nadpisac wartosc domyslna', () => {
    expect(safeRedirectPath('//evil.example', '/login')).toBe('/login');
  });
});
