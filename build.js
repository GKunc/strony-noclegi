// Prosty build: wstrzykuje wspólne nagłówki i stopki do index.html i strony blogowej.
// Edytuj HTML nagłówka/stopki w katalogu `partials/`, a następnie uruchom:
//   node build.js

const fs = require("fs");
const path = require("path");

// Podmienia całe tagi <header>...</header> lub <footer>...</footer>
// na zawartość z partiali, bez szukania znaczników komentarza.
function replaceTagInFile(filePath, tagName, replacementHtml) {
  let content = fs.readFileSync(filePath, "utf8");

  // Obejmuje również białe znaki wokół tagu, żeby kolejne uruchomienia
  // nie dokładały kolejnych pustych linii.
  const pattern = new RegExp(
    `\\s*<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>\\s*`,
    "i",
  );

  if (!pattern.test(content)) {
    throw new Error(
      `Nie znaleziono tagu <${tagName}> w pliku ${filePath}. Upewnij się, że plik zawiera poprawny tag <${tagName}>...</${tagName}>.`,
    );
  }

  const newContent = content.replace(
    pattern,
    "\n" + replacementHtml.trim() + "\n",
  );

  fs.writeFileSync(filePath, newContent, "utf8");
}

function main() {
  const projectRoot = __dirname;

  // Wczytaj wspólne partiale (z pełnymi tagami <header> i <footer>)
  const header = fs.readFileSync(
    path.join(projectRoot, "partials/header.html"),
    "utf8",
  );
  const footer = fs.readFileSync(
    path.join(projectRoot, "partials/footer.html"),
    "utf8",
  );

  // Wszystkie strony, na których podmieniamy nagłówek i stopkę
  const pages = [
    "index.html",
    "blog/ile-kosztuje-strona-dla-noclegu.html",
    "blog/jak-opisac-nocleg-na-stronie.html",
    "blog/jak-przygotowac-zdjecia-noclegu.html",
    "blog/jak-promowac-strone-noclegu.html",
  ];

  for (const relativePath of pages) {
    const filePath = path.join(projectRoot, relativePath);

    replaceTagInFile(filePath, "header", header);
    replaceTagInFile(filePath, "footer", footer);
  }

  console.log("Build zakończony: nagłówki i stopki zostały zaktualizowane.");
}

if (require.main === module) {
  main();
}
