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
      document.querySelectorAll(".month, .ed-head").forEach(function (m) {
        var next = m.nextElementSibling, vis = false;
        while (next && !next.classList.contains("month") && !next.classList.contains("ed-head")) {
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

  /* newsletter: our own Azure endpoint (signal-newsletter/api/subscribe).
     Success is shown ONLY on {ok:true} from the server. Every failure path
     says so honestly — no fake confirmations, ever. No third party involved. */
  document.querySelectorAll("[data-news]").forEach(function (form) {
    var endpoint = form.getAttribute("action");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = form.parentElement.querySelector("[data-news-ok]");
      var btn = form.querySelector('button[type="submit"]');
      var email = form.querySelector('input[type="email"]');
      var trap = form.querySelector('input[name="company"]');
      function say(msg, good) {
        if (ok) {
          ok.textContent = msg;
          ok.style.display = "block";
          ok.style.color = good ? "var(--brass)" : "var(--ember)";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Sign up"; }
      }
      if (!email || !email.checkValidity()) { say("Enter a valid email address.", false); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Joining…"; }
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.value.trim(),
          source: "site",
          company: trap ? trap.value : ""
        })
      })
        .then(function (res) {
          return res.json().then(function (data) { return { status: res.status, data: data }; });
        })
        .then(function (out) {
          if (out.status === 200 && out.data && out.data.ok) {
            form.reset();
            var state = out.data.state || "new";
            if (state === "already") {
              say("You're already on the list — see you 07:30 IST.", true);
            } else if (state === "resent") {
              say("Still pending — fresh confirm link sent, check your inbox.", true);
            } else {
              say("Check your inbox to confirm — one click and you're in.", true);
            }
          } else {
            say("That didn't go through (" + ((out.data && out.data.error) || ("http " + out.status)) + ") — try again.", false);
          }
        })
        .catch(function () { say("Couldn't reach the list — check connection and try again.", false); });
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

  /* app-like page transitions: veil sweeps in on internal navigation.
     Same-page anchors, new tabs, downloads and off-site links untouched. */
  (function () {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^[a-z]+:/i.test(href)) return;
      var url;
      try { url = new URL(href, window.location.href); }
      catch (err) { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      var veil = document.createElement("div");
      veil.id = "pageVeil";
      veil.setAttribute("aria-hidden", "true");
      veil.innerHTML = '<div class="bv-ring"></div>';
      document.body.appendChild(veil);
      requestAnimationFrame(function () { veil.classList.add("on"); });
      setTimeout(function () { window.location.href = url.href; }, 270);
    });
  })();
})();
