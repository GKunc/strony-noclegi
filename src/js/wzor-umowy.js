// Przycisk „Eksportuj PDF” na stronie wzoru umowy (przeniesione ze starej strony).
(function () {
  var exportPdfCleanBtn = document.querySelector(".js-export-pdf-clean");
  var placeholderPattern = /\[[^\]]+\]/g;

  function replacePlaceholdersForPrint() {
    var contractCard = document.querySelector(".article .prose");
    if (!contractCard) {
      return function () {};
    }

    var changedNodes = [];
    var walker = document.createTreeWalker(
      contractCard,
      NodeFilter.SHOW_TEXT,
      null,
    );

    while (walker.nextNode()) {
      var node = walker.currentNode;
      var originalText = node.nodeValue;

      if (!originalText || !placeholderPattern.test(originalText)) {
        placeholderPattern.lastIndex = 0;
        continue;
      }

      placeholderPattern.lastIndex = 0;
      changedNodes.push([node, originalText]);
      node.nodeValue = originalText.replace(
        placeholderPattern,
        "________",
      );
    }

    return function restoreOriginalText() {
      for (var i = 0; i < changedNodes.length; i++) {
        changedNodes[i][0].nodeValue = changedNodes[i][1];
      }
    };
  }

  function printDocument() {
    var restore = function () {};
    restore = replacePlaceholdersForPrint();

    var restored = false;
    function restoreOnce() {
      if (restored) {
        return;
      }
      restored = true;
      restore();
    }

    window.addEventListener("afterprint", restoreOnce, { once: true });
    window.print();
    window.setTimeout(restoreOnce, 1500);
  }

  if (exportPdfCleanBtn) {
    exportPdfCleanBtn.addEventListener("click", function () {
      printDocument();
    });
  }
})();
