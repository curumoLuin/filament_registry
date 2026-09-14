/**
 * Postgres funkcje tej aplikacji zgłaszają błędy z ustalonym prefiksem
 * (INSUFFICIENT_QUANTITY, FILAMENT_MISSING, NO_LINES). Prefiks jest częścią
 * kontraktu między bazą a trasami API — baza jest ostatecznym arbitrem, a to
 * jest miejsce, w którym jej werdykt zamienia się w zdanie dla użytkownika.
 *
 * Funkcja żyje osobno, bo korzystają z niej dwie trasy: tworzenie projektu
 * (create_project_with_lines) i zmiana statusu (set_project_status).
 */
export function humanise(message: string): string {
  if (message.includes('INSUFFICIENT_QUANTITY')) {
    return message.replace(/^.*INSUFFICIENT_QUANTITY:\s*/, 'Not enough filament: ');
  }
  if (message.includes('FILAMENT_MISSING')) {
    return message.replace(/^.*FILAMENT_MISSING:\s*/, 'Filament no longer in inventory: ');
  }
  if (message.includes('LINES_NOT_IN_INVENTORY')) {
    const counts = /LINES_NOT_IN_INVENTORY:\s*(\d+) of (\d+)/.exec(message);
    if (!counts) return 'Some of the selected filaments are not in your inventory.';
    const [, missing, total] = counts;
    return missing === '1'
      ? `One of the ${total} selected filaments is not in your inventory.`
      : `${missing} of the ${total} selected filaments are not in your inventory.`;
  }
  if (message.includes('NO_LINES')) {
    return 'This project has no filament lines.';
  }
  if (message.includes('NOT_AUTHENTICATED')) {
    return 'Your session has expired — please sign in again.';
  }
  return message;
}
