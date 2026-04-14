// Prosty build: wstrzykuje wspólne nagłówki i stopki do index.html i strony blogowej.
// Edytuj HTML nagłówka/stopki w katalogu `partials/`, a następnie uruchom:
//   node build.js

const fs = require("fs");
const path = require("path");

function replaceSection(filePath, startMarker, endTag, replacementHtml) {
  let content = fs.readFileSync(filePath, "utf8");

  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(
      `Nie znaleziono znacznika startowego w ${filePath}: ${startMarker}`,
    );
  }

  const endIndex = content.indexOf(endTag, startIndex);
  if (endIndex === -1) {
    throw new Error(
      `Nie znaleziono znacznika końcowego w ${filePath}: ${endTag}`,
    );
  }

  const afterEnd = endIndex + endTag.length;

  const before = content.slice(0, startIndex + startMarker.length);
  const after = content.slice(afterEnd);

  const newSection = "\n" + replacementHtml.trimEnd() + "\n";

  const newContent = before + newSection + after;
  fs.writeFileSync(filePath, newContent, "utf8");
}

function main() {
  const projectRoot = __dirname;

  // Wczytaj wspólne partiale
  const header = fs.readFileSync(
    path.join(projectRoot, "partials/header.html"),
    "utf8",
  );
  const footer = fs.readFileSync(
    path.join(projectRoot, "partials/footer.html"),
    "utf8",
  );

  // index.html
  const indexPath = path.join(projectRoot, "index.html");
  replaceSection(
    indexPath,
    "    <!-- ===== HEADER ===== -->",
    "    </header>",
    header,
  );
  replaceSection(
    indexPath,
    "    <!-- ===== FOOTER ===== -->",
    "    </footer>",
    footer,
  );

  // blog/ile-kosztuje-strona-dla-noclegu.html
  const blogPath = path.join(
    projectRoot,
    "blog/ile-kosztuje-strona-dla-noclegu.html",
  );
  replaceSection(
    blogPath,
    "    <!-- ===== HEADER (jak na stronie głównej, z linkami na ../index.html#sekcja) ===== -->",
    "    </header>",
    header,
  );
  replaceSection(
    blogPath,
    "    <!-- ===== FOOTER (jak na stronie głównej, z linkami na ../index.html#sekcja) ===== -->",
    "    </footer>",
    footer,
  );

  console.log("Build zakończony: nagłówki i stopki zostały zaktualizowane.");
}

if (require.main === module) {
  main();
}
