# strony-noclegi

Statyczna strona ofertowa dla właścicieli noclegów (StronaNoclegi.pl) + prosty poradnik w katalogu `blog/`.

## Struktura nagłówka i stopki

Nagłówek i stopka są utrzymywane w dwóch wspólnych plikach partials i wstrzykiwane do stron za pomocą prostego skryptu `build.js`:

- `partials/header.html` – wspólny nagłówek dla `index.html` i stron w `blog/`
- `partials/footer.html` – wspólna stopka dla `index.html` i stron w `blog/`

Menu i linki w nagłówku/stopce używają adresów względnych do katalogu głównego (np. `/#problem`), dzięki czemu działają tak samo z poziomu strony głównej i podstron bloga.

Jeśli chcesz zmienić menu, logo, kontakt lub linki w stopce, edytuj plik w `partials/`, a następnie uruchom build.

## Build statycznych stron

Do zaktualizowania nagłówków i stopek na wszystkich stronach służy prosty skrypt w Node.js:

1. Upewnij się, że masz zainstalowanego Node.js (na macOS zazwyczaj jest dostępny jako `node`).
2. W katalogu projektu uruchom:

   ```bash
   node build.js
   ```

Skrypt:

- wczyta HTML nagłówka i stopki z katalogu `partials/`,
- podmieni odpowiednie sekcje w `index.html` oraz w `blog/ile-kosztuje-strona-dla-noclegu.html`.

Po zmianie któregokolwiek z plików w `partials/` pamiętaj, aby ponownie uruchomić `node build.js` przed wypchnięciem zmian lub deployem.
