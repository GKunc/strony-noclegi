// Motyw jasny/ciemny (przeniesione ze starej strony). Ładowane w <head>, żeby strona nie mrugała.
(function () {
      "use strict";

      var storageKey = "tao-theme";
      var sessionStorageKey = "tao-theme-session";
      var consentKey = "tao-cookie-consent";
      var root = document.documentElement;

      function getStoredConsent() {
        try {
          var raw = localStorage.getItem(consentKey);
          if (!raw) return null;
          var parsed = JSON.parse(raw);

          if (!parsed || typeof parsed !== "object") {
            return null;
          }

          if (parsed.expiresAt && Number(parsed.expiresAt) < Date.now()) {
            localStorage.removeItem(consentKey);
            return null;
          }

          return parsed;
        } catch (err) {
          return null;
        }
      }

      function hasPreferenceConsent() {
        var consent = getStoredConsent();
        return Boolean(consent && consent.preferences === true);
      }

      function getFromLocalStorage(key) {
        try {
          return localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      }

      function setInLocalStorage(key, value) {
        try {
          localStorage.setItem(key, value);
        } catch (err) {
          // Intentionally empty (np. tryb prywatny)
        }
      }

      function removeFromLocalStorage(key) {
        try {
          localStorage.removeItem(key);
        } catch (err) {
          // Intentionally empty
        }
      }

      function getFromSessionStorage(key) {
        try {
          return sessionStorage.getItem(key);
        } catch (err) {
          return null;
        }
      }

      function setInSessionStorage(key, value) {
        try {
          sessionStorage.setItem(key, value);
        } catch (err) {
          // Intentionally empty (np. tryb prywatny)
        }
      }

      function removeFromSessionStorage(key) {
        try {
          sessionStorage.removeItem(key);
        } catch (err) {
          // Intentionally empty
        }
      }

      function getPreferredTheme() {
        return window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }

      function getStoredTheme() {
        if (hasPreferenceConsent()) {
          return getFromLocalStorage(storageKey);
        }

        return getFromSessionStorage(sessionStorageKey);
      }

      function storeTheme(theme) {
        if (theme !== "dark" && theme !== "light") {
          return;
        }

        if (hasPreferenceConsent()) {
          setInLocalStorage(storageKey, theme);
          removeFromSessionStorage(sessionStorageKey);
        } else {
          // Fallback bez trwałego zapisu: motyw utrzymuje się między podstronami
          // tylko w ramach aktualnej sesji przeglądarki.
          setInSessionStorage(sessionStorageKey, theme);
        }
      }

      function updateToggleUi(theme) {
        var isDark = theme === "dark";
        var toggles = document.querySelectorAll(".theme-toggle");

        for (var i = 0; i < toggles.length; i++) {
          var btn = toggles[i];
          var icon = btn.querySelector(".theme-toggle-icon");
          var label = isDark ? "Włącz tryb jasny" : "Włącz tryb ciemny";

          btn.setAttribute("aria-pressed", String(isDark));
          btn.setAttribute("aria-label", label);
          btn.setAttribute("title", label);

          if (icon) {
            icon.textContent = isDark ? "☀️" : "🌙";
          }
        }
      }

      function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        updateToggleUi(theme);
      }

      function toggleTheme() {
        var current =
          root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        var next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        storeTheme(next);
      }

      var initialTheme = getStoredTheme() || getPreferredTheme();
      applyTheme(initialTheme);

      document.addEventListener("DOMContentLoaded", function () {
        var toggles = document.querySelectorAll(".theme-toggle");
        for (var i = 0; i < toggles.length; i++) {
          toggles[i].addEventListener("click", toggleTheme);
        }
        // This script now runs in <head>, before the buttons exist: set their icon/label once they do.
        updateToggleUi(root.getAttribute("data-theme") === "dark" ? "dark" : "light");
      });

      if (window.matchMedia) {
        var media = window.matchMedia("(prefers-color-scheme: dark)");
        var onChange = function (event) {
          if (!getStoredTheme()) {
            applyTheme(event.matches ? "dark" : "light");
          }
        };

        if (typeof media.addEventListener === "function") {
          media.addEventListener("change", onChange);
        } else if (typeof media.addListener === "function") {
          media.addListener(onChange);
        }
      }

      window.addEventListener("tao:consent-updated", function (event) {
        var consent = event && event.detail ? event.detail : null;

        if (consent && consent.preferences === true) {
          var sessionTheme = getFromSessionStorage(sessionStorageKey);
          var activeTheme = root.getAttribute("data-theme");
          var themeToStore =
            sessionTheme === "dark" || sessionTheme === "light"
              ? sessionTheme
              : activeTheme;

          if (themeToStore === "dark" || themeToStore === "light") {
            setInLocalStorage(storageKey, themeToStore);
            applyTheme(themeToStore);
          }

          removeFromSessionStorage(sessionStorageKey);
          return;
        }

        if (!consent || consent.preferences !== true) {
          removeFromLocalStorage(storageKey);
          removeFromSessionStorage(sessionStorageKey);
          applyTheme(getPreferredTheme());
        }
      });
    })();
