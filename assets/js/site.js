/* Theme toggle. The saved choice is applied before first paint by the small
   inline script in each page's <head>; this file wires up the button. */
(function () {
  "use strict";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: light)");

  function current() {
    return root.getAttribute("data-theme") || (media.matches ? "light" : "dark");
  }
  function sync() {
    var t = current();
    root.setAttribute("data-theme-current", t);
    document.querySelectorAll(".theme-toggle").forEach(function (b) {
      b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
  }

  document.querySelectorAll(".theme-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
      sync();
    });
  });

  if (media.addEventListener) media.addEventListener("change", sync);
  sync();
})();
