import { describe, expect, it } from 'vitest';
import { humanise } from '../../src/lib/server/db-errors';

/**
 * Ryzyko adresowane - patrz context/foundation/test-plan.md
 *   R-10 tworzenie projektu zostawia projekt bez pozycji
 *
 * Prefiksy bledow Postgresa sa kontraktem miedzy baza a trasami API
 * (docs/reference/contract-surfaces.md). Baza jest instancja rozstrzygajaca,
 * a to jest jedyne miejsce, w ktorym jej werdykt zamienia sie w zdanie dla
 * uzytkownika - wiec przeoczenie prefiksu oznacza surowy blad bazy na ekranie.
 */

describe('R-10 · werdykt bazy zamienia sie w zdanie dla uzytkownika', () => {
  it('rozpoznaje prefiks mimo opakowania przez PostgREST', () => {
    // supabase-js nie oddaje czystego komunikatu raise; prefiks siedzi w srodku
    const wrapped = 'INSUFFICIENT_QUANTITY: PLA Czarny needs 400 g but only 120 g is available';
    expect(humanise(wrapped)).toBe('Not enough filament: PLA Czarny needs 400 g but only 120 g is available');
  });

  it('nazywa szpule, ktorej juz nie ma', () => {
    expect(humanise('FILAMENT_MISSING: PETG Bialy')).toBe('Filament no longer in inventory: PETG Bialy');
  });

  it('odmienia komunikat o pozycjach spoza magazynu przez liczbe', () => {
    // ten prefiks niesie liczbe, nie nazwe - dlatego ma wlasna galaz
    expect(humanise('LINES_NOT_IN_INVENTORY: 1 of 3')).toBe(
      'One of the 3 selected filaments is not in your inventory.',
    );
    expect(humanise('LINES_NOT_IN_INVENTORY: 2 of 3')).toBe(
      '2 of the 3 selected filaments are not in your inventory.',
    );
  });

  it('nie wysypuje sie, gdy liczby nie da sie odczytac', () => {
    expect(humanise('LINES_NOT_IN_INVENTORY')).toBe(
      'Some of the selected filaments are not in your inventory.',
    );
  });

  it('tlumaczy prefiksy bez ladunku', () => {
    expect(humanise('NO_LINES')).toBe('This project has no filament lines.');
    expect(humanise('NOT_AUTHENTICATED')).toBe('Your session has expired — please sign in again.');
  });

  it('oddaje nieznany komunikat bez zmian', () => {
    // swiadomy wybor: lepiej pokazac surowy blad niz zgubic jedyny slad
    expect(humanise('connection terminated unexpectedly')).toBe('connection terminated unexpectedly');
  });
});
