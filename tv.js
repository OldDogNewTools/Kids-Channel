/* Kids TV - remote-control layer for the Android TV app.
   Loaded only by the TV app shell. The phone/tablet page never loads this file.
   The shell forwards remote buttons by calling window.__kidsTvKey(name). */
(function () {
  "use strict";
  if (window.__kidsTvKey) return;

  var YT_ORIGIN = "https://www.youtube-nocookie.com";

  // ---------- Look ----------
  var css = document.createElement("style");
  css.textContent =
    "html.tv .tv-on{outline:5px solid #ffcc33;outline-offset:3px;}" +
    "html.tv button:focus, html.tv input:focus, html.tv textarea:focus{outline:5px solid #ffcc33;outline-offset:3px;}" +
    "html.tv .tile.tv-on{transform:scale(1.05);}" +
    "html.tv #lockBtn{opacity:.8;}" +
    "#tvHint{font-size:14px;color:#b9c2e6;white-space:nowrap;}";
  document.head.appendChild(css);
  document.documentElement.classList.add("tv");

  function $(id) { return document.getElementById(id); }
  function isOpen(id) { var e = $(id); return !!(e && e.classList.contains("open")); }

  // ---------- YouTube player control ----------
  // Adds enablejsapi=1 to the embed address so the player accepts pause/skip commands.
  var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  if (desc && desc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, "src", {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set: function (v) {
        v = String(v);
        if (v.indexOf(YT_ORIGIN + "/embed/") === 0 && v.indexOf("enablejsapi=") === -1) {
          v += (v.indexOf("?") === -1 ? "?" : "&") + "enablejsapi=1&origin=" + encodeURIComponent(location.origin);
        }
        desc.set.call(this, v);
      }
    });
  }

  var yt = { state: -1, time: 0, heard: false, wantPlaying: true };
  function frame() { var w = $("frameWrap"); return w ? w.querySelector("iframe") : null; }
  function post(obj) {
    var f = frame();
    if (f && f.contentWindow) { try { f.contentWindow.postMessage(JSON.stringify(obj), YT_ORIGIN); } catch (e) {} }
  }
  function cmd(func, args) { post({ event: "command", func: func, args: args || [] }); }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== YT_ORIGIN) return;
    var d; try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch (e) { return; }
    if (!d || !d.info || typeof d.info !== "object") return;
    yt.heard = true;
    if (typeof d.info.playerState === "number") {
      yt.state = d.info.playerState;
      if (yt.state === 1) yt.wantPlaying = true;
      if (yt.state === 2) yt.wantPlaying = false;
    }
    if (typeof d.info.currentTime === "number") yt.time = d.info.currentTime;
  });

  // Ask each new player to report its state (playing / paused / time).
  var listenTimer = null;
  function startListening() {
    yt.state = -1; yt.time = 0; yt.heard = false; yt.wantPlaying = true;
    clearInterval(listenTimer);
    var tries = 0;
    listenTimer = setInterval(function () {
      if (yt.heard || ++tries > 40 || !frame()) { clearInterval(listenTimer); return; }
      post({ event: "listening", id: 1, channel: "widget" });
    }, 500);
  }
  function togglePlay() {
    if (yt.wantPlaying) { cmd("pauseVideo"); yt.wantPlaying = false; }
    else { cmd("playVideo"); yt.wantPlaying = true; }
  }
  function skip(sec) {
    yt.time = Math.max(0, yt.time + sec);
    cmd("seekTo", [yt.time, true]);
  }

  // ---------- Moving the highlight with the arrow buttons ----------
  function layer() {
    if (isOpen("player")) return "player";
    if (isOpen("gate")) return "gate";
    if (isOpen("parent")) return "parent";
    return "home";
  }
  function inLayer(el, name) {
    if (name === "home") return !el.closest(".overlay") && !el.closest("#player");
    return !!el.closest("#" + name);
  }
  function candidates(name) {
    var all = document.querySelectorAll("button, input, textarea");
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled || !inLayer(el, name)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push(el);
    }
    return out;
  }
  function clearMark() {
    var old = document.querySelectorAll(".tv-on");
    for (var i = 0; i < old.length; i++) old[i].classList.remove("tv-on");
  }
  function focusEl(el) {
    if (!el) return;
    clearMark();
    el.classList.add("tv-on");
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    if (el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "nearest" });
  }
  var remembered = {};   // last highlighted element per layer
  function current(name) {
    var a = document.activeElement;
    if (a && a !== document.body && document.contains(a) && inLayer(a, name)) {
      var r = a.getBoundingClientRect();
      if (r.width > 0 && !a.disabled) return a;
    }
    return null;
  }
  function ensureFocus(name, index) {
    if (name === "player") { clearMark(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return; }
    var have = current(name);
    if (have) { if (!have.classList.contains("tv-on")) { clearMark(); have.classList.add("tv-on"); } return; }
    var list = candidates(name);
    if (!list.length) return;
    var el = remembered[name];
    if ((!el || list.indexOf(el) === -1) && name === "home" && !index) {
      el = document.querySelector("#favGrid .tile, #showGrid .tile");   // start on the first show
    }
    if (!el || list.indexOf(el) === -1) el = list[Math.max(0, Math.min(index || 0, list.length - 1))];
    focusEl(el);
  }
  function move(name, dir) {
    var cur = current(name);
    var list = candidates(name);
    if (!list.length) return;
    if (!cur) { ensureFocus(name); return; }
    var c = cur.getBoundingClientRect();
    var cx = c.left + c.width / 2;
    var best = null, i, el, r;

    if (dir === "left" || dir === "right") {
      // Stay on the same row: nearest button to that side.
      var bestGap = Infinity;
      for (i = 0; i < list.length; i++) {
        el = list[i]; if (el === cur) continue;
        r = el.getBoundingClientRect();
        if (!(r.bottom > c.top + 2 && r.top < c.bottom - 2)) continue;
        var gap = dir === "right" ? r.left - c.right : c.left - r.right;
        if (gap < -2) continue;
        if (gap < bestGap) { bestGap = gap; best = el; }
      }
    } else {
      // Find the nearest row above/below, then the closest button on that row.
      var rows = [], nearest = Infinity, nearestRect = null;
      for (i = 0; i < list.length; i++) {
        el = list[i]; if (el === cur) continue;
        r = el.getBoundingClientRect();
        var d = dir === "down" ? r.top - c.bottom : c.top - r.bottom;
        if (d < -2) continue;
        rows.push({ el: el, r: r, d: d });
        if (d < nearest) { nearest = d; nearestRect = r; }
      }
      var bestX = Infinity;
      for (i = 0; i < rows.length; i++) {
        r = rows[i].r;
        if (!(r.bottom > nearestRect.top + 2 && r.top < nearestRect.bottom - 2)) continue;
        var dx = (r.right > cx && r.left < cx) ? 0 : Math.min(Math.abs(r.left - cx), Math.abs(r.right - cx));
        if (dx < bestX) { bestX = dx; best = rows[i].el; }
      }
    }
    if (best) { focusEl(best); remembered[name] = best; }
  }

  function isTextBox(el) {
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    var t = (el.type || "text").toLowerCase();
    return t !== "checkbox" && t !== "radio" && t !== "button" && t !== "submit";
  }

  function hint() {
    var bar = $("playerBar");
    if (!bar || $("tvHint")) return;
    var h = document.createElement("div");
    h.id = "tvHint";
    h.textContent = "OK: pause / play  ·  ◀ ▶: skip 10s  ·  ▲ ▼: previous / next  ·  Back: close";
    bar.appendChild(h);
  }

  // ---------- Remote buttons ----------
  // Returns "ok" normally, "exit" when Back is pressed on the home screen,
  // or "ime:x,y" when the on-screen keyboard should open for the text box at x,y.
  window.__kidsTvKey = function (key) {
    var name = layer();

    if (name === "player") {
      switch (key) {
        case "back": $("backBtn").click(); break;
        case "ok": case "playpause": togglePlay(); break;
        case "play": cmd("playVideo"); yt.wantPlaying = true; break;
        case "pause": cmd("pauseVideo"); yt.wantPlaying = false; break;
        case "left": case "rw": skip(-10); break;
        case "right": case "ff": skip(10); break;
        case "up": case "prev": cmd("previousVideo"); break;
        case "down": case "next": cmd("nextVideo"); break;
      }
      ensureFocus(layer());
      return "ok";
    }

    if (key === "back") {
      if (name === "gate") $("gateCancel").click();
      else if (name === "parent") { $("parentDone").click(); remembered.home = null; }
      else {
        var s = $("search");
        if (s && s.value) { s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); ensureFocus("home"); return "ok"; }
        return "exit";
      }
      ensureFocus(layer());
      return "ok";
    }

    if (key === "up" || key === "down" || key === "left" || key === "right") { move(name, key); return "ok"; }

    if (key === "ok") {
      var cur = current(name);
      if (!cur) { ensureFocus(name); return "ok"; }
      if (isTextBox(cur)) {
        var r = cur.getBoundingClientRect();
        return "ime:" + Math.round(r.left + r.width / 2) + "," + Math.round(r.top + r.height / 2);
      }
      var index = candidates(name).indexOf(cur);
      remembered[name] = cur;
      cur.click();
      var now = layer();
      if (name === "parent" && now === "home") remembered.home = null;
      ensureFocus(now, now === name ? index : 0);
      return "ok";
    }
    return "ok";
  };

  // A touch or mouse click can also open the player; keep the helpers in step.
  var p = $("player");
  if (p && window.MutationObserver) {
    new MutationObserver(function () {
      if (isOpen("player")) { hint(); startListening(); }
    }).observe(p, { attributes: true, attributeFilter: ["class"] });
  }

  ensureFocus(layer());
})();
