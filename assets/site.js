/* SIGNAL v2 — theme, scrollspy, share, filter. Degrades cleanly with JS off. */
(function () {
  "use strict";
  var root = document.documentElement;

  /* theme: noir default, paper on demand, persisted */
  function currentTheme() {
    try { return localStorage.getItem("signal-theme") || "noir"; } catch (e) { return "noir"; }
  }
  function paintTheme(t) {
    root.setAttribute("data-theme", t);
    document.querySelectorAll("[data-theme-label]").forEach(function (el) {
      el.textContent = t === "paper" ? "☾ Noir" : "☀ Paper";
    });
  }
  paintTheme(currentTheme());
  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "paper" ? "noir" : "paper";
      try { localStorage.setItem("signal-theme", next); } catch (e) {}
      paintTheme(next);
    });
  });

  /* progress + nav shadow + toTop */
  var bar = document.getElementById("progress");
  var toTop = document.getElementById("toTop");
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    if (toTop) toTop.classList.toggle("show", h.scrollTop > 900);
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* scrollspy for article TOC */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove("active"); });
          var link = map[en.target.id];
          if (link) link.classList.add("active");
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    Object.keys(map).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) obs.observe(s);
    });
  }

  /* archive filter */
  var q = document.getElementById("archiveSearch");
  if (q) {
    q.addEventListener("input", function () {
      var needle = q.value.toLowerCase().trim(), count = 0;
      document.querySelectorAll(".issue-row").forEach(function (row) {
        var hit = !needle || row.textContent.toLowerCase().indexOf(needle) !== -1;
        row.style.display = hit ? "" : "none";
        if (hit) count++;
      });
      document.querySelectorAll(".month").forEach(function (m) {
        var next = m.nextElementSibling, vis = false;
        while (next && !next.classList.contains("month")) {
          if (next.classList.contains("issue-row") && next.style.display !== "none") { vis = true; break; }
          next = next.nextElementSibling;
        }
        m.style.display = vis ? "" : "none";
      });
      var n = document.getElementById("archiveCount");
      if (n) n.textContent = count + (count === 1 ? " edition" : " editions");
    });
  }

  /* share: Web Share API, clipboard fallback */
  document.querySelectorAll("[data-share]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var data = { title: document.title, url: window.location.href };
      function fallback() {
        function done(msg) { btn.textContent = msg; setTimeout(function(){ btn.textContent = "⇪ Share"; }, 1600); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.location.href).then(function(){done("Copied");}, function(){done("Copy failed");});
        } else { done("Copy this URL"); }
      }
      if (navigator.share) { navigator.share(data).catch(function () {}); }
      else { fallback(); }
    });
  });
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-copy") || window.location.href;
      function done() { btn.textContent = "Copied"; setTimeout(function(){ btn.textContent = "Copy link"; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, done); }
      else { done(); }
    });
  });

  /* newsletter: fetch-first POST to Buttondown's keyless embed endpoint.
     Whatever happens, the reader NEVER leaves this page: the fallback posts
     into a hidden iframe instead of navigating (the old form.submit() page-leave
     is gone). The API key never ships to browsers. */
  document.querySelectorAll("[data-news]").forEach(function (form) {
    var endpoint = form.getAttribute("action");
    var frameName = form.getAttribute("target");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = form.parentElement.querySelector("[data-news-ok]");
      var btn = form.querySelector('button[type="submit"]');
      var email = form.querySelector('input[type="email"]');
      var finished = false;
      function done(msg, good) {
        if (finished) return;
        finished = true;
        if (ok) {
          ok.textContent = msg;
          ok.style.display = "block";
          ok.style.color = good ? "var(--brass)" : "var(--ember)";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Sign up"; }
      }
      if (!email || !email.checkValidity()) { done("Enter a valid email address.", false); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Joining…"; }
      function viaFrame() {
        var frame = frameName && document.querySelector('iframe[name="' + frameName + '"]');
        if (frame) {
          frame.addEventListener("load", function () {
            form.reset();
            done("You're in. Check your inbox to confirm — first briefing 06:00 IST.", true);
          }, { once: true });
          setTimeout(function () {
            form.reset();
            done("You're in. Check your inbox to confirm — first briefing 06:00 IST.", true);
          }, 12000);
        }
        form.submit();
      }
      fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            done("You're in. Check your inbox to confirm — first briefing 06:00 IST.", true);
          } else { viaFrame(); }
        })
        .catch(function () { viaFrame(); });
    });
  });

  /* figure counters — numbers tick up when scrolled into view */
  var counters = document.querySelectorAll("[data-count-to]");
  function runCounter(el) {
    var to = parseFloat(el.getAttribute("data-count-to"));
    var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var pre = el.getAttribute("data-prefix") || "", suf = el.getAttribute("data-suffix") || "";
    var t0 = null, dur = 1300;
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (to * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if ("IntersectionObserver" in window && counters.length) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCounter(en.target); cObs.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cObs.observe(el); });
  }

  var y = document.getElementById("yr");
  if (y) y.textContent = new Date().getFullYear();
})();
