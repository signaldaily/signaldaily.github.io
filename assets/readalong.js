/* SIGNAL read-along — narration drives the page.
   Segment engine: on audio time, scroll to the speaking section,
   glow it, and light the page keywords the voice is naming.
   Captions: per-word karaoke from TTS word-boundary timings. */
(function () {
  "use strict";
  var btn = document.getElementById("listenBtn");
  if (!btn) return;
  var tag = document.querySelector('script[src*="readalong.js"]');
  var AUDIO_URL = tag ? tag.getAttribute("data-audio") : null;
  var CUES_URL = tag ? tag.getAttribute("data-cues") : null;
  if (!AUDIO_URL || !CUES_URL) return;

  var dock = document.getElementById("readDock");
  var playBtn = document.getElementById("rdPlay");
  var segEl = document.getElementById("rdSeg");
  var timeEl = document.getElementById("rdTime");
  var seek = document.getElementById("rdSeek");
  var cap = document.getElementById("rdCap");
  var speedBtn = document.getElementById("rdSpeed");
  var followBox = document.getElementById("rdFollow");
  var closeBtn = document.getElementById("rdClose");

  var audio = null, cues = null, sentences = [], curSeg = -1, curSent = -1;
  var raf = null, speeds = [1, 1.25, 1.5], speedI = 0;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  }

  function clearMarks() {
    document.querySelectorAll("mark.spoken").forEach(function (m) {
      m.replaceWith(document.createTextNode(m.textContent));
    });
    document.querySelectorAll(".section.speaking").forEach(function (s) {
      s.classList.remove("speaking");
    });
  }

  function markPhrase(scope, phrase) {
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      var p = n.parentElement;
      if (!p || p.closest("svg") || p.closest("mark") || p.closest(".toc")) continue;
      nodes.push(n);
    }
    var needle = phrase.toLowerCase();
    for (var i = 0; i < nodes.length; i++) {
      var idx = nodes[i].textContent.toLowerCase().indexOf(needle);
      if (idx !== -1) {
        var range = document.createRange();
        range.setStart(nodes[i], idx);
        range.setEnd(nodes[i], idx + phrase.length);
        var mark = document.createElement("mark");
        mark.className = "spoken";
        range.surroundContents(mark);
        return true;
      }
    }
    return false;
  }

  function activateSegment(i) {
    clearMarks();
    curSeg = i;
    if (i < 0 || !cues) return;
    var seg = cues.segments[i];
    segEl.textContent = "❧ " + seg.title;
    var scope = document.querySelector(seg.target);
    if (!scope) return;
    var section = scope.closest ? (scope.closest(".section") || scope) : scope;
    if (section.classList) section.classList.add("speaking");
    (seg.keys || []).forEach(function (k) { markPhrase(scope, k); });
    if (followBox.checked) {
      var scrollTarget = scope.classList && scope.classList.contains("section") ? scope : section;
      scrollTarget.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function buildSentences() {
    sentences = [];
    var cur = [];
    cues.words.forEach(function (w) {
      cur.push(w);
      if (/[.?!:;]$/.test(w.w)) { sentences.push(cur); cur = []; }
    });
    if (cur.length) sentences.push(cur);
  }

  function sentIndexAt(t) {
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      if (t >= s[0].s && t <= s[s.length - 1].e + 0.15) return i;
    }
    return -1;
  }

  var capSpans = [], capWords = [], lastActive = -1;
  function renderCaption(t) {
    var si = sentIndexAt(t);
    if (si !== curSent) {
      curSent = si; lastActive = -1;
      cap.innerHTML = "";
      capSpans = []; capWords = [];
      if (si === -1) return;
      sentences[si].forEach(function (w) {
        var sp = document.createElement("span");
        sp.className = "w";
        sp.textContent = w.w;
        sp.addEventListener("click", function () { if (audio) audio.currentTime = w.s + 0.01; });
        cap.appendChild(sp);
        cap.appendChild(document.createTextNode(" "));
        capSpans.push(sp); capWords.push(w);
      });
    }
    if (si === -1 || !capSpans.length) return;
    // Monotonic active word: never blanks between words, DOM touched only on change.
    var active = 0;
    for (var i = 0; i < capWords.length; i++) {
      if (t >= capWords[i].s) active = i; else break;
    }
    if (active !== lastActive) {
      if (lastActive >= 0 && capSpans[lastActive]) capSpans[lastActive].classList.remove("on");
      capSpans[active].classList.add("on");
      lastActive = active;
    }
  }

  var lastSec = -1, dragging = false;
  function tick() {
    if (!audio) return;
    var t = audio.currentTime;
    if (!dragging) seek.value = t;
    var sec = Math.floor(t);
    if (sec !== lastSec) {
      lastSec = sec;
      timeEl.textContent = fmt(t) + " / " + fmt(audio.duration || 0);
    }
    var si = -1;
    for (var i = 0; i < cues.segments.length; i++) {
      if (t >= cues.segments[i].start && t <= cues.segments[i].end) { si = i; break; }
    }
    if (si !== curSeg) activateSegment(si);
    renderCaption(t);
    if (!audio.paused) raf = requestAnimationFrame(tick);
  }

  function setPlayingUI() {
    playBtn.textContent = audio && !audio.paused ? "⏸" : "▶";
  }

  async function loadCues() {
    // Fetch throws nothing on HTTP errors — check .ok. One retry, then
    // null (caller degrades to plain playback; voice must never die on cues).
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var res = await fetch(CUES_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("cues HTTP " + res.status);
        var j = await res.json();
        if (j && (j.words || j.segments)) return j;
        throw new Error("cues empty");
      } catch (e) {
        if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1500); });
      }
    }
    return null;
  }

  async function start() {
    dock.hidden = false;
    document.body.classList.add("dock-open");
    if (reduceMotion) followBox.checked = false;
    if (!cues) {
      segEl.textContent = "Loading voice…";
      cues = await loadCues();
      if (!cues) {
        cues = { segments: [], words: [] };
        segEl.textContent = "Voice only (sync unavailable)";
      }
      buildSentences();
      audio = new Audio(AUDIO_URL);
      audio.preload = "auto";
      if (cues.words.length) {
        seek.max = cues.words[cues.words.length - 1].e + 0.5;
        timeEl.textContent = "0:00 / " + fmt(parseFloat(seek.max));
      } else {
        seek.max = 100;
        timeEl.textContent = "0:00 / --:--";
      }
      audio.addEventListener("play", function () { setPlayingUI(); raf = requestAnimationFrame(tick); });
      audio.addEventListener("pause", setPlayingUI);
      audio.addEventListener("ended", function () {
        setPlayingUI(); playBtn.textContent = "↺";
        curSeg = -1; curSent = -1;
      });
      audio.addEventListener("seeked", function () { curSeg = -2; curSent = -1; lastActive = -1; });
      seek.addEventListener("pointerdown", function () { dragging = true; });
      window.addEventListener("pointerup", function () { dragging = false; });
      seek.addEventListener("input", function () {
        if (audio) { audio.currentTime = parseFloat(seek.value); curSeg = -2; curSent = -1; lastActive = -1; }
      });
    }
    dock.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      var pp = audio.play();
      if (pp && pp.catch) pp.catch(function () {
        // Mobile blocked autoplay (no tap yet on this page): say so plainly
        // instead of sitting on "Loading voice…".
        segEl.textContent = "Tap \u25B6 to play";
      });
    } catch (e) {
      segEl.textContent = "Tap \u25B6 to play";
    }
  }

  btn.addEventListener("click", start);
  // Email deep-link autoplay: ?play=1 tries to start the voice on load.
  // Mobile browsers may block sound without a tap — start() already opens
  // the dock, so the worst case is one visible tap on ▶.
  try {
    var qp = new URLSearchParams(window.location.search);
    if (qp.get("play") === "1" && btn) {
      var kick = function () { start(); };
      if (document.readyState === "complete") setTimeout(kick, 700);
      else window.addEventListener("load", function () { setTimeout(kick, 700); });
    }
  } catch (e) {}
  playBtn.addEventListener("click", function () {
    if (!audio) return;
    if (audio.paused && playBtn.textContent === "↺") { audio.currentTime = 0; curSeg = -2; curSent = -1; }
    audio.paused ? audio.play().catch(function () {}) : audio.pause();
  });
  speedBtn.addEventListener("click", function () {
    speedI = (speedI + 1) % speeds.length;
    if (audio) audio.playbackRate = speeds[speedI];
    speedBtn.textContent = String(speeds[speedI]).replace(".5", ".5") + "×";
  });
  closeBtn.addEventListener("click", function () {
    if (audio) audio.pause();
    if (raf) cancelAnimationFrame(raf);
    clearMarks();
    curSeg = -1; curSent = -1; cap.innerHTML = "";
    dock.hidden = true;
    document.body.classList.remove("dock-open");
  });
})();
