// Zachowanie strony przeniesione 1:1 ze starej wersji: zgoda na cookies, cień nagłówka, menu mobilne,
// formularz kontaktowy (walidacja + zabezpieczenia antyspamowe, wysyłka do webhooka n8n) i animacje sekcji.
// FAQ działa teraz na <details>, więc nie potrzebuje skryptu.

(function () {
      "use strict";

      var consentKey = "tao-cookie-consent";
      var themeKey = "tao-theme";
      var consentTtlMs = 365 * 24 * 60 * 60 * 1000;

      var banner = document.getElementById("cookie-consent");
      var preferencesInput = document.getElementById(
        "cookie-pref-preferences",
      );
      var acceptAllBtn = document.getElementById("cookie-accept-all");
      var rejectBtn = document.getElementById("cookie-reject");
      var saveBtn = document.getElementById("cookie-save");
      var settingsBtns = document.querySelectorAll(".js-cookie-settings");

      if (
        !banner ||
        !preferencesInput ||
        !acceptAllBtn ||
        !rejectBtn ||
        !saveBtn
      ) {
        return;
      }

      function safeGet(key) {
        try {
          return localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      }

      function safeSet(key, value) {
        try {
          localStorage.setItem(key, value);
        } catch (err) {
          // Intentionally empty
        }
      }

      function safeRemove(key) {
        try {
          localStorage.removeItem(key);
        } catch (err) {
          // Intentionally empty
        }
      }

      function readConsent() {
        var raw = safeGet(consentKey);
        if (!raw) return null;

        try {
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") {
            return null;
          }

          if (parsed.expiresAt && Number(parsed.expiresAt) < Date.now()) {
            safeRemove(consentKey);
            return null;
          }

          return parsed;
        } catch (err) {
          return null;
        }
      }

      function buildConsent(preferencesEnabled) {
        return {
          necessary: true,
          preferences: Boolean(preferencesEnabled),
          updatedAt: new Date().toISOString(),
          expiresAt: Date.now() + consentTtlMs,
        };
      }

      function applyConsent(consent) {
        safeSet(consentKey, JSON.stringify(consent));

        if (!consent.preferences) {
          safeRemove(themeKey);
        }

        banner.hidden = true;
        banner.classList.remove("visible");

        window.dispatchEvent(
          new CustomEvent("tao:consent-updated", {
            detail: consent,
          }),
        );
      }

      function openBanner() {
        var existing = readConsent();
        preferencesInput.checked = Boolean(existing && existing.preferences);
        banner.hidden = false;
        banner.classList.add("visible");
      }

      var consent = readConsent();
      if (!consent) {
        openBanner();
      }

      acceptAllBtn.addEventListener("click", function () {
        preferencesInput.checked = true;
        applyConsent(buildConsent(true));
      });

      rejectBtn.addEventListener("click", function () {
        preferencesInput.checked = false;
        applyConsent(buildConsent(false));
      });

      saveBtn.addEventListener("click", function () {
        applyConsent(buildConsent(preferencesInput.checked));
      });

      for (var i = 0; i < settingsBtns.length; i++) {
        settingsBtns[i].addEventListener("click", function () {
          openBanner();
        });
      }
    })();

(function () {
  "use strict";

  // --- Sticky header shadow ---
  var header = document.querySelector(".site-header");
  if (header) {
    var scrolled = false;
    var onScroll = function () {
      var shouldScroll = window.scrollY > 10;
      if (shouldScroll !== scrolled) {
        scrolled = shouldScroll;
        header.classList.toggle("scrolled", scrolled);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // --- Mobile menu toggle ---
  var mobileToggle = document.querySelector(".mobile-toggle");
  var mobileNav = document.getElementById("mobile-nav");
  if (mobileToggle && mobileNav) {
    var isOpen = false;
    var setOpen = function (open) {
      isOpen = open;
      mobileNav.classList.toggle("open", isOpen);
      mobileToggle.setAttribute("aria-expanded", String(isOpen));
      mobileToggle.setAttribute("aria-label", isOpen ? "Zamknij menu" : "Otwórz menu");
    };
    mobileToggle.addEventListener("click", function () { setOpen(!isOpen); });
    var mobileLinks = mobileNav.querySelectorAll("a");
    for (var i = 0; i < mobileLinks.length; i++) {
      mobileLinks[i].addEventListener("click", function () { setOpen(false); });
    }
  }

  // --- Scroll animations (Intersection Observer) ---
        if ("IntersectionObserver" in window) {
          var fadeEls = document.querySelectorAll(".fade-in");
          var observer = new IntersectionObserver(
            function (entries) {
              for (var m = 0; m < entries.length; m++) {
                if (entries[m].isIntersecting) {
                  entries[m].target.classList.add("visible");
                  observer.unobserve(entries[m].target);
                }
              }
            },
            { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
          );

          for (var n = 0; n < fadeEls.length; n++) {
            observer.observe(fadeEls[n]);
          }
        } else {
          // Fallback: show everything
          var allFade = document.querySelectorAll(".fade-in");
          for (var p = 0; p < allFade.length; p++) {
            allFade[p].classList.add("visible");
          }
        }
})();

(function () {
  "use strict";
  var form = document.getElementById("contact-form");
  if (!form) return;

  // --- Form validation ---
        var successMsg = document.getElementById("form-success");
        var globalError = document.getElementById("form-global-error");
        var defaultGlobalErrorHtml = globalError ? globalError.innerHTML : "";
        var honeypotField = document.getElementById("website");
        var secondHoneypotField = document.getElementById("company");
        var formStartTsField = document.getElementById("form-start-ts");
        var jsCheckField = document.getElementById("js-check");
        var formFingerprintField = document.getElementById("form-fingerprint");
        var clientTokenField = document.getElementById("client-token");
        var submitButton = form
          ? form.querySelector('button[type="submit"]')
          : null;
        var antiSpamLastSubmitKey = "tao-contact-last-submit";
        var minFillTimeMs = 5000;
        var minIntervalBetweenSubmitsMs = 90000;
        var maxMessageLinks = 1;
        var minInteractionScore = 2;
        var interactionScore = 0;
        var blockedEmailDomains = {
          "mailinator.com": true,
          "guerrillamail.com": true,
          "10minutemail.com": true,
          "tempmail.com": true,
          "yopmail.com": true,
          "sharklasers.com": true,
        };

        function setSubmitEnabled(isEnabled) {
          if (!submitButton) return;

          submitButton.disabled = !isEnabled;
          submitButton.setAttribute("aria-disabled", String(!isEnabled));
        }

        function buildFingerprint() {
          var tz = "";
          try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
          } catch (err) {
            tz = "";
          }

          var nav = window.navigator || {};
          var screenInfo = window.screen || {};

          return [
            nav.language || "",
            nav.platform || "",
            String(screenInfo.width || ""),
            String(screenInfo.height || ""),
            String(new Date().getTimezoneOffset()),
            tz,
          ].join("|");
        }

        function simpleHash(input) {
          var h = 2166136261;
          for (var i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
          }

          return (h >>> 0).toString(36);
        }

        function normalizeText(value) {
          return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
        }

        function hasBlockedKeywords(value) {
          var text = normalizeText(value);

          if (!text) return false;

          return /(casino|viagra|porn|crypto\s*bonus|forex|seo\s*services|backlinks?)/i.test(
            text,
          );
        }

        function isDisposableEmail(email) {
          var parts = (email || "").trim().toLowerCase().split("@");
          if (parts.length !== 2) return false;
          return !!blockedEmailDomains[parts[1]];
        }

        function markInteraction() {
          interactionScore = Math.min(interactionScore + 1, 10);
          if (interactionScore >= minInteractionScore) {
            setSubmitEnabled(true);
          }
        }

        if (formStartTsField) {
          formStartTsField.value = String(Date.now());
        }

        if (jsCheckField) {
          jsCheckField.value = "1";
        }

        if (formFingerprintField) {
          formFingerprintField.value = buildFingerprint();
        }

        if (clientTokenField) {
          var seed = [
            formStartTsField ? formStartTsField.value : "",
            formFingerprintField ? formFingerprintField.value : "",
            "tao-contact-v2",
          ].join("|");
          clientTokenField.value = simpleHash(seed);
        }

        setSubmitEnabled(false);

        if (form) {
          ["pointerdown", "keydown", "touchstart", "input", "change"].forEach(
            function (eventName) {
              form.addEventListener(eventName, markInteraction, {
                passive: true,
              });
            },
          );
        }

        function safeStorageGet(key) {
          try {
            return localStorage.getItem(key);
          } catch (err) {
            return null;
          }
        }

        function safeStorageSet(key, value) {
          try {
            localStorage.setItem(key, value);
          } catch (err) {
            // Intentionally empty
          }
        }

        function hideGlobalError() {
          if (globalError) {
            globalError.classList.remove("visible");
            globalError.innerHTML = defaultGlobalErrorHtml;
          }
        }

        function showGlobalError(messageHtml) {
          if (globalError) {
            globalError.innerHTML = messageHtml || defaultGlobalErrorHtml;
            globalError.classList.add("visible");
          }
        }

        function showError(id) {
          var el = document.getElementById(id);
          if (el) el.classList.add("visible");
        }

        function hideError(id) {
          var el = document.getElementById(id);
          if (el) el.classList.remove("visible");
        }

        function validatePhone(value) {
          // Accept Polish phone numbers: optional +48, then 9 digits, spaces/dashes allowed
          var cleaned = value.replace(/[\s\-\(\)]/g, "");
          return /^(\+48)?[0-9]{9}$/.test(cleaned);
        }

        function validateEmail(value) {
          // Prosta walidacja adresu e-mail
          var trimmed = value.trim();
          if (!trimmed) return false;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
        }

        function countLinks(text) {
          var matches = text.match(/(?:https?:\/\/|www\.)/gi);
          return matches ? matches.length : 0;
        }

        function containsHtmlTags(text) {
          return /<[^>]+>/.test(text);
        }

        function hasSuspiciousRepetition(text) {
          return /(.)\1{7,}/.test(text);
        }

        function hasSuspiciousName(value) {
          var trimmed = value.trim();

          if (trimmed.length > 80) return true;
          if (/https?:\/\//i.test(trimmed)) return true;
          if (hasBlockedKeywords(trimmed)) return true;

          return false;
        }

        function shouldBlockMessage(text) {
          var trimmed = text.trim();
          if (!trimmed) return false;
          if (trimmed.length > 2000) return true;
          if (countLinks(trimmed) > maxMessageLinks) return true;
          if (containsHtmlTags(trimmed)) return true;
          if (hasSuspiciousRepetition(trimmed)) return true;
          if (hasBlockedKeywords(trimmed)) return true;
          return false;
        }

        function getTimeOnFormMs() {
          if (!formStartTsField || !formStartTsField.value) {
            return Infinity;
          }

          var startedAt = Number(formStartTsField.value);
          if (!startedAt || Number.isNaN(startedAt)) {
            return Infinity;
          }

          return Date.now() - startedAt;
        }

        function resetFormStartTime() {
          if (formStartTsField) {
            formStartTsField.value = String(Date.now());
          }
        }

        function isSubmittingTooFast() {
          var lastSubmitRaw = safeStorageGet(antiSpamLastSubmitKey);
          var lastSubmitAt = Number(lastSubmitRaw || 0);
          return Date.now() - lastSubmitAt < minIntervalBetweenSubmitsMs;
        }

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var valid = true;

          var nameField = document.getElementById("name");
          var emailField = document.getElementById("email");
          var phoneField = document.getElementById("phone");
          var consentField = document.getElementById("consent");

          // Reset
          hideError("name-error");
          hideError("email-error");
          hideError("phone-error");
          hideError("consent-error");
          nameField.classList.remove("error");
          emailField.classList.remove("error");
          phoneField.classList.remove("error");

          // Name
          if (nameField.value.trim().length < 2) {
            showError("name-error");
            nameField.classList.add("error");
            valid = false;
          }

          if (valid && hasSuspiciousName(nameField.value)) {
            showError("name-error");
            nameField.classList.add("error");
            valid = false;
          }

          // Email
          if (!validateEmail(emailField.value)) {
            showError("email-error");
            emailField.classList.add("error");
            valid = false;
          }

          if (valid && isDisposableEmail(emailField.value)) {
            showGlobalError(
              "Użyj proszę standardowego adresu e-mail (nie tymczasowego), abyśmy mogli skutecznie odpowiedzieć.",
            );
            valid = false;
          }

          // Phone
          if (!validatePhone(phoneField.value)) {
            showError("phone-error");
            phoneField.classList.add("error");
            valid = false;
          }

          // Consent
          if (!consentField.checked) {
            showError("consent-error");
            valid = false;
          }

          if (
            valid &&
            ((honeypotField && honeypotField.value.trim()) ||
              (secondHoneypotField && secondHoneypotField.value.trim()))
          ) {
            // Bot likely filled hidden field; fake success and skip network request.
            form.reset();
            form.style.display = "none";
            successMsg.classList.add("visible");
            resetFormStartTime();
            return;
          }

          if (valid && interactionScore < minInteractionScore) {
            showGlobalError(
              "Wykryliśmy nietypową próbę wysyłki. Wypełnij formularz ręcznie i spróbuj ponownie.",
            );
            return;
          }

          if (valid && getTimeOnFormMs() < minFillTimeMs) {
            showGlobalError(
              "Wysyłka formularza nastąpiła zbyt szybko. Poczekaj chwilę i spróbuj ponownie.",
            );
            resetFormStartTime();
            return;
          }

          if (valid && (!form.action || !/^https:\/\//.test(form.action))) {
            showGlobalError();
            return;
          }

          var messageField = document.getElementById("message");
          if (valid && messageField && shouldBlockMessage(messageField.value)) {
            showGlobalError(
              "Treść wiadomości wygląda na automatyczną. Usuń linki/znaczniki i spróbuj ponownie.",
            );
            return;
          }

          if (valid && isSubmittingTooFast()) {
            showGlobalError(
              "Wiadomość została wysłana przed chwilą. Odczekaj około 30 sekund i spróbuj ponownie.",
            );
            return;
          }

          if (valid) {
            hideGlobalError();
            safeStorageSet(antiSpamLastSubmitKey, String(Date.now()));

            // Wysyłka danych formularza do zewnętrznego serwisu (np. Formspree)
            var formData = new FormData(form);
            formData.set("_form_fill_time_ms", String(getTimeOnFormMs()));
            formData.set("_spam_check", "client_v2_pass");
            formData.set("_interaction_score", String(interactionScore));

            fetch(form.action, {
              method: form.method || "POST",
              body: formData,
              headers: {
                Accept: "application/json",
              },
            })
              .then(function (response) {
                if (response.ok) {
                  form.reset();
                  form.style.display = "none";
                  successMsg.classList.add("visible");
                  resetFormStartTime();
                } else {
                  showGlobalError();
                }
              })
              .catch(function () {
                showGlobalError();
              });
          }
        });

        // Live validation: hide error on input
        document.getElementById("name").addEventListener("input", function () {
          hideError("name-error");
          this.classList.remove("error");
        });
        document.getElementById("email").addEventListener("input", function () {
          hideError("email-error");
          this.classList.remove("error");
        });
        document.getElementById("phone").addEventListener("input", function () {
          hideError("phone-error");
          this.classList.remove("error");
        });
        document
          .getElementById("consent")
          .addEventListener("change", function () {
            hideError("consent-error");
          });
})();
