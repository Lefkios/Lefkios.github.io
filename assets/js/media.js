/* Media system behaviour. No dependencies. See MEDIA.md for markup.
   - video[data-autoplay]: muted loop that plays only while on screen and
     only when the visitor has not asked for reduced motion.
   - .yt[data-yt-id]: YouTube click-to-load facade (youtube-nocookie.com).
   - a[data-lightbox]: opens the linked image in a keyboard-accessible dialog.
   - .compare: before/after slider driven by a range input. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Autoplaying loops ---------- */
  function setupLoops() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video[data-autoplay]"));
    if (!videos.length) return;

    videos.forEach(function (v) {
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("muted", "");
    });

    function applyPreference() {
      videos.forEach(function (v) {
        if (reduceMotion.matches) {
          v.pause();
          v.controls = !v.hasAttribute("data-no-controls");
        } else {
          v.controls = false;
        }
      });
    }
    applyPreference();
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", applyPreference);

    function tryPlay(v) {
      if (reduceMotion.matches) return;
      if (v.preload === "none") v.preload = "auto";
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: poster stays */ });
    }

    if (!("IntersectionObserver" in window)) {
      videos.forEach(tryPlay);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) tryPlay(e.target);
        else e.target.pause();
      });
    }, { threshold: 0.25 });
    videos.forEach(function (v) { io.observe(v); });
  }

  /* ---------- YouTube facade ---------- */
  function setupYouTube() {
    document.querySelectorAll(".yt[data-yt-id]").forEach(function (btn) {
      var id = btn.getAttribute("data-yt-id");
      var img = btn.querySelector("img");
      if (img && !img.getAttribute("src")) {
        img.src = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
      }
      btn.addEventListener("click", function () {
        var iframe = document.createElement("iframe");
        iframe.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
          "?autoplay=1&rel=0&modestbranding=1";
        iframe.title = btn.getAttribute("data-yt-title") || "YouTube video";
        iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        btn.replaceWith(iframe);
        iframe.focus();
      });
    });
  }

  /* ---------- Lightbox ---------- */
  function setupLightbox() {
    var links = document.querySelectorAll("a[data-lightbox]");
    if (!links.length || typeof HTMLDialogElement !== "function") return;

    var dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "Enlarged image");
    dlg.innerHTML =
      '<div class="lightbox__inner">' +
      '<img class="lightbox__img" alt="">' +
      '<p class="lightbox__caption"></p>' +
      "</div>" +
      '<button type="button" class="lightbox__btn lightbox__close" aria-label="Close">&#x2715;</button>' +
      '<button type="button" class="lightbox__btn lightbox__prev" aria-label="Previous image">&#x2039;</button>' +
      '<button type="button" class="lightbox__btn lightbox__next" aria-label="Next image">&#x203A;</button>';
    document.body.appendChild(dlg);

    var img = dlg.querySelector(".lightbox__img");
    var cap = dlg.querySelector(".lightbox__caption");
    var prev = dlg.querySelector(".lightbox__prev");
    var next = dlg.querySelector(".lightbox__next");
    var group = [];
    var index = 0;
    var opener = null;

    function show(i) {
      index = (i + group.length) % group.length;
      var a = group[index];
      var thumb = a.querySelector("img");
      var fig = a.closest("figure");
      var fc = fig && fig.querySelector("figcaption");
      img.src = a.getAttribute("href");
      img.alt = thumb ? thumb.alt : "";
      img.classList.toggle("is-photo", a.hasAttribute("data-photo"));
      cap.textContent = fc ? fc.textContent.trim() : "";
      prev.hidden = next.hidden = group.length < 2;
    }

    links.forEach(function (a) {
      a.addEventListener("click", function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; // let users open in a new tab
        ev.preventDefault();
        var scope = a.closest("[data-gallery]");
        group = scope ? Array.prototype.slice.call(scope.querySelectorAll("a[data-lightbox]")) : [a];
        opener = a;
        show(group.indexOf(a));
        dlg.showModal();
      });
    });

    dlg.querySelector(".lightbox__close").addEventListener("click", function () { dlg.close(); });
    prev.addEventListener("click", function () { show(index - 1); });
    next.addEventListener("click", function () { show(index + 1); });
    dlg.addEventListener("click", function (ev) {
      // Click on the dark backdrop (not the image or a button) closes.
      if (ev.target === dlg || ev.target.classList.contains("lightbox__inner")) dlg.close();
    });
    dlg.addEventListener("keydown", function (ev) {
      if (group.length < 2) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); show(index - 1); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); show(index + 1); }
    });
    // Escape closes natively. Return focus to the image that opened the dialog
    // (Safari does not focus links on click, so do it explicitly).
    dlg.addEventListener("close", function () {
      img.removeAttribute("src");
      if (opener) opener.focus();
    });
  }

  /* ---------- Before / after ---------- */
  function setupCompare() {
    document.querySelectorAll(".compare").forEach(function (box) {
      var input = box.querySelector('input[type="range"]');
      if (!input) return;
      function update() { box.style.setProperty("--pos", input.value + "%"); }
      input.addEventListener("input", update);
      update();
    });
  }

  function init() {
    setupLoops();
    setupYouTube();
    setupLightbox();
    setupCompare();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
