(function initI18n() {
  function t(name, substitutions) {
    return chrome.i18n.getMessage(name, substitutions) || name;
  }

  function applyI18n(root = document) {
    for (const element of root.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }

    for (const element of root.querySelectorAll("[data-i18n-html]")) {
      element.innerHTML = t(element.dataset.i18nHtml);
    }

    for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    }
  }

  window.t = t;
  window.applyI18n = applyI18n;
  document.documentElement.lang = (chrome.i18n.getUILanguage() || "en").split("-")[0];

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyI18n(), { once: true });
    return;
  }

  applyI18n();
})();
