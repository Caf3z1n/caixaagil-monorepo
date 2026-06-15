(function () {
  if (window.__caixaAgilLandingHistoryRestore) {
    return;
  }

  window.__caixaAgilLandingHistoryRestore = true;

  function isLandingPage() {
    return (
      window.location.pathname === "/" ||
      Boolean(document.querySelector(".hero, .site-header, [data-reveal]"))
    );
  }

  window.addEventListener("pageshow", function (event) {
    var navigationEntry = performance.getEntriesByType("navigation")[0];
    var legacyNavigation = performance.navigation;
    var isHistoryRestore =
      event.persisted ||
      (navigationEntry && navigationEntry.type === "back_forward") ||
      (legacyNavigation && legacyNavigation.type === 2);

    if (isHistoryRestore && isLandingPage()) {
      window.location.reload();
    }
  });
})();
