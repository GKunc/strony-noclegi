// Prosty build: wstrzykuje wspólne nagłówki i stopki do index.html i strony blogowej.
// Edytuj HTML nagłówka/stopki w katalogu `partials/`, a następnie uruchom:
//   node build.js

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fileExists(projectRoot, relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
  });

  return result.status === 0;
}

function runPrettierFix(projectRoot) {
  console.log("\n[build] Uruchamiam Prettier --write...");

  const success = runCommand("npx", ["prettier", ".", "--write"], projectRoot);

  if (!success) {
    console.warn(
      "[build] Pominięto Prettier fix (narzędzie niedostępne lub błąd wykonania).",
    );
  }
}

function runLintFix(projectRoot) {
  const hasEslintConfig =
    fileExists(projectRoot, "eslint.config.js") ||
    fileExists(projectRoot, "eslint.config.cjs") ||
    fileExists(projectRoot, "eslint.config.mjs") ||
    fileExists(projectRoot, ".eslintrc") ||
    fileExists(projectRoot, ".eslintrc.js") ||
    fileExists(projectRoot, ".eslintrc.cjs") ||
    fileExists(projectRoot, ".eslintrc.json") ||
    fileExists(projectRoot, ".eslintrc.yaml") ||
    fileExists(projectRoot, ".eslintrc.yml");

  if (!hasEslintConfig) {
    console.log(
      "\n[build] Pominięto ESLint --fix (brak konfiguracji ESLint w repo).",
    );
    return;
  }

  console.log("\n[build] Uruchamiam ESLint --fix...");
  const success = runCommand(
    "npx",
    ["eslint", "build.js", "--fix"],
    projectRoot,
  );

  if (!success) {
    console.warn(
      "[build] Pominięto ESLint fix (narzędzie niedostępne lub błąd wykonania).",
    );
  }
}

// Podmienia całe tagi <header>...</header> lub <footer>...</footer>
// na zawartość z partiali, bez szukania znaczników komentarza.
function replaceTagInFile(filePath, tagName, replacementHtml) {
  let content = fs.readFileSync(filePath, "utf8");

  // Obejmuje również białe znaki wokół tagu, żeby kolejne uruchomienia
  // nie dokładały kolejnych pustych linii.
  const pattern =
    tagName === "header"
      ? new RegExp(
          `\\s*<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>\\s*(?:<script>[\\s\\S]*?var storageKey\\s*=\\s*["']tao-theme["'][\\s\\S]*?<\\/script>\\s*)*`,
          "i",
        )
      : new RegExp(
          `\\s*<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>\\s*(?:<script>[\\s\\S]*?var consentKey\\s*=\\s*["']tao-cookie-consent["'][\\s\\S]*?<\\/script>\\s*)*`,
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

  runPrettierFix(projectRoot);
  runLintFix(projectRoot);

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
    "polityka-prywatnosci.html",
    "wzor-umowy.html",
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
