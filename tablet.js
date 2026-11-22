/* Kids TV - tablet layer: a daily time limit with lockout.
   Loaded only by the Kids TV app shell on touch tablets. The phone page and the
   TV app never load this file. Timer data is kept apart from the video list
   (which stays under "kidsTV.v1"), in its own storage key below. */
(function () {
  "use strict";
  if (window.__kidsTablet) return;
  window.__kidsTablet = true;

  var TKEY = "kidsTV.timer.v1";
  var YT_ORIGIN = "https://www.youtube-nocookie.com";
  var CHOICES = [0, 15, 30, 45, 60, 90, 120];      // minutes per day; 0 = no limit
  var inShell = window.__kidsShell === "tablet";   // true inside the app, false in a plain browser

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function isOpen(id) { var e = $(id); return !!(e && e.classList.contains("open")); }

  // Asks the app shell to do something (pin / unpin the screen). Returns its answer.
  function shell(cmd) {
    if (!inShell) return "";
    try { var r = window.prompt("kidstv:" + cmd, ""); return r == null ? "" : String(r); } catch (e) { return ""; }
  }

  // ---------- Saved timer data ----------
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function loadT() {
    try {
      var d = JSON.parse(localStorage.getItem(TKEY));
      if (d && typeof d.limit === "number") {
        return { limit: d.limit, day: String(d.day || today()), used: +d.used || 0, bonus: +d.bonus || 0 };
      }
    } catch (e) {}
    return { limit: 0, day: today(), used: 0, bonus: 0 };
  }
  function saveT() { try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch (e) {} }
  var t = loadT();
  function allowed() { return t.limit * 60 + t.bonus; }           // seconds allowed today
  function left() { return Math.max(0, allowed() - t.used); }      // seconds left today
  function mins(sec) { return Math.ceil(sec / 60) + " min"; }

  // ---------- Pausing the video (used when the app is put away) ----------
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
  window.__kidsPause = function () {
    var w = $("frameWrap"), f = w ? w.querySelector("iframe") : null;
    if (f && f.contentWindow) {
      try { f.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), YT_ORIGIN); } catch (e) {}
    }
    saveT();
    return "ok";
  };

  // ---------- Look ----------
  var css = document.createElement("style");
  css.textContent =
    "#tChip{font-size:16px;color:#b9c2e6;white-space:nowrap;}" +
    "#tLock{position:fixed;inset:0;z-index:90;background:#1b2340;display:none;overflow-y:auto;" +
      "padding:calc(env(safe-area-inset-top) + 24px) 16px calc(env(safe-area-inset-bottom) + 30px);text-align:center;}" +
    "#tLock.open{display:block;}" +
    "#tLock .big{font-size:96px;line-height:1.1;margin-top:6vh;}" +
    "#tLock h1{font-size:44px;margin:10px 0;}" +
    "#tLock p{font-size:22px;color:#b9c2e6;margin:6px 0 40px;}" +
    "#tGrown{background:transparent;font-size:17px;opacity:.55;padding:12px 18px;}" +
    "#tToast{position:fixed;top:calc(env(safe-area-inset-top) + 12px);left:50%;transform:translateX(-50%);z-index:85;" +
      "background:#ffcc33;color:#222;font-size:20px;font-weight:700;padding:10px 22px;border-radius:30px;display:none;" +
      "box-shadow:0 4px 18px rgba(0,0,0,.5);white-space:nowrap;}" +
    "#tChoices{flex-wrap:wrap;}#tChoices button{min-width:84px;}" +
    "#tCard .btn:not(.on){background:#3a4578;}" +
    "#tMoreBtns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:24px 0;}";
  document.head.appendChild(css);

  // Time-left chip in the header
  var chip = el("div", null, "");
  chip.id = "tChip";
  var lockBtn = $("lockBtn");
  if (lockBtn && lockBtn.parentNode) lockBtn.parentNode.insertBefore(chip, lockBtn);

  // "5 minutes left" style notice
  var toast = el("div", null, "");
  toast.id = "tToast";
  document.body.appendChild(toast);
  var toastTimer = null;
  function notice(text) {
    toast.textContent = text;
    toast.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.display = "none"; }, 7000);
  }

  // ---------- Time's-up screen ----------
  var lock = el("div");
  lock.id = "tLock";
  var panel = el("div", "panel");
  lock.appendChild(panel);

  var vDone = el("div");
  vDone.appendChild(el("div", "big", "🌙"));
  vDone.appendChild(el("h1", null, "Time's up!"));
  vDone.appendChild(el("p", null, "All done for today. See you tomorrow!"));
  var grown = el("button", null, "🔒 Grown-ups");
  grown.id = "tGrown";
  vDone.appendChild(grown);

  var vGate = el("div");
  var gRow = el("div", "row");
  var gCancel = el("button", "btn", "✕ Close");
  gRow.appendChild(gCancel);
  vGate.appendChild(gRow);
  var gQ = el("div", "question"), gA = el("div", "answer"), gPad = el("div", "pad");
  vGate.appendChild(gQ); vGate.appendChild(gA); vGate.appendChild(gPad);

  var vMore = el("div");
  vMore.appendChild(el("h1", null, "Add more time today?"));
  var moreBtns = el("div");
  moreBtns.id = "tMoreBtns";
  [15, 30, 60].forEach(function (m) {
    var b = el("button", "btn primary", "+" + m + " minutes");
    b.addEventListener("click", function () { t.bonus += m * 60; saveT(); update(); });
    moreBtns.appendChild(b);
  });
  vMore.appendChild(moreBtns);
  var stay = el("button", "btn", "No, stay locked");
  vMore.appendChild(stay);

  panel.appendChild(vDone); panel.appendChild(vGate); panel.appendChild(vMore);
  document.body.appendChild(lock);

  function view(which) {
    vDone.style.display = which === "done" ? "" : "none";
    vGate.style.display = which === "gate" ? "" : "none";
    vMore.style.display = which === "more" ? "" : "none";
  }
  var answer = 0, typed = "";
  function ask() {
    var a = 12 + Math.floor(Math.random() * 8), b = 3 + Math.floor(Math.random() * 7);
    answer = a * b; typed = "";
    gQ.textContent = a + " × " + b + " = ?";
    gA.textContent = "";
    view("gate");
  }
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach(function (k) {
    var b = el("button", null, k);
    if (k === "OK") { b.style.background = "var(--accent)"; b.style.color = "#222"; }
    b.addEventListener("click", function () {
      if (k === "⌫") typed = typed.slice(0, -1);
      else if (k === "OK") {
        if (parseInt(typed, 10) === answer) { view("more"); return; }
        ask(); gA.textContent = "Try again"; return;
      } else if (typed.length < 4) typed += k;
      gA.textContent = typed;
    });
    gPad.appendChild(b);
  });
  grown.addEventListener("click", ask);
  gCancel.addEventListener("click", function () { view("done"); });
  stay.addEventListener("click", function () { view("done"); });

  var locked = false;
  function lockNow() {
    locked = true;
    saveT();
    if (isOpen("player")) $("backBtn").click();      // stops the video
    if (isOpen("gate")) $("gateCancel").click();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    toast.style.display = "none";
    view("done");
    lock.classList.add("open");
  }
  function unlockNow() {
    locked = false;
    lock.classList.remove("open");
  }

  // ---------- Grown-up settings card ----------
  var card = el("div", "card");
  card.id = "tCard";
  var h = el("h3", null, "Screen time"); h.style.marginTop = "0";
  card.appendChild(h);
  card.appendChild(el("label", null, "Daily time limit for Kids TV on this tablet"));
  var choices = el("div", "seg");
  choices.id = "tChoices";
  CHOICES.forEach(function (m) {
    var b = el("button", "btn", m ? m + " min" : "No limit");
    b.dataset.min = String(m);
    b.addEventListener("click", function () { t.limit = m; saveT(); update(); });
    choices.appendChild(b);
  });
  card.appendChild(choices);
  var status = el("div", "msg", "");
  card.appendChild(status);
  var row = el("div", "row");
  var add15 = el("button", "btn small", "+15 min today");
  add15.addEventListener("click", function () { t.bonus += 900; saveT(); update(); });
  var again = el("button", "btn small", "Start today again");
  again.addEventListener("click", function () { t.used = 0; t.bonus = 0; saveT(); update(); });
  row.appendChild(add15); row.appendChild(again);
  card.appendChild(row);
  card.appendChild(el("p", "help",
    "Time counts while Kids TV is on the screen. When it runs out, a \"Time's up\" screen appears until tomorrow, " +
    "or until a grown-up adds more time. This limit covers Kids TV only, not other apps on the tablet."));

  var pinMsg = null;
  if (inShell) {
    var h2 = el("h3", null, "Keep the tablet on Kids TV");
    card.appendChild(h2);
    card.appendChild(el("p", "help",
      "Pin holds Kids TV on the screen so the Home button doesn't leave it. If the tablet asks, tap OK. " +
      "Come back here and tap Unpin when you're done."));
    var prow = el("div", "row");
    var pin = el("button", "btn small", "Pin");
    var unpin = el("button", "btn small", "Unpin");
    pin.addEventListener("click", function () { shell("pin"); pinTried = Date.now(); });
    unpin.addEventListener("click", function () { shell("unpin"); pinTried = 0; });
    prow.appendChild(pin); prow.appendChild(unpin);
    card.appendChild(prow);
    pinMsg = el("div", "msg", "");
    card.appendChild(pinMsg);
  }
  var pinTried = 0;

  var parentPanel = document.querySelector("#parent .panel");
  if (parentPanel) {
    if (parentPanel.children.length > 1) parentPanel.insertBefore(card, parentPanel.children[1]);
    else parentPanel.appendChild(card);
  }

  // ---------- Keeping everything up to date ----------
  var lastLeft = null;
  function update() {
    var on = t.limit > 0, l = left();

    if (on && l <= 0 && !locked && !isOpen("parent")) lockNow();
    else if (locked && (!on || l > 0)) unlockNow();

    chip.textContent = on && !locked ? "⏳ " + mins(l) : "";

    if (on && !locked && lastLeft != null) {
      if (lastLeft > 300 && l <= 300 && l > 60) notice("⏳ 5 minutes left");
      else if (lastLeft > 60 && l <= 60 && l > 0) notice("⏳ 1 minute left");
    }
    lastLeft = on ? l : null;

    if (isOpen("parent")) {
      Array.prototype.forEach.call(choices.children, function (b) { b.classList.toggle("on", +b.dataset.min === t.limit); });
      var usedMin = Math.floor(t.used / 60);
      status.className = "msg";
      status.textContent = on
        ? "Used today: " + usedMin + " min. " + (l > 0 ? mins(l) + " left." : "Time is up for today.")
        : "No limit. Used today: " + usedMin + " min.";
      add15.disabled = !on;
      if (pinMsg) {
        var st = shell("pinstate");
        if (st === "pinned") { pinMsg.className = "msg ok"; pinMsg.textContent = "Pinned. Kids TV stays on the screen."; }
        else if (pinTried && Date.now() - pinTried > 4000) {
          pinMsg.className = "msg err"; pinMsg.textContent = "This tablet did not allow pinning.";
        } else { pinMsg.className = "msg"; pinMsg.textContent = pinTried ? "Asking the tablet…" : "Not pinned."; }
      }
    }
  }

  var lastTick = Date.now(), sinceSave = 0;
  function tick() {
    var now = Date.now(), dt = (now - lastTick) / 1000;
    lastTick = now;
    if (t.day !== today()) { t.day = today(); t.used = 0; t.bonus = 0; saveT(); }   // new day
    if (dt < 0 || dt > 5) dt = 0;          // the tablet was asleep or the app was put away
    var counting = t.limit > 0 && !locked && document.visibilityState !== "hidden" &&
      !isOpen("parent") && !isOpen("gate");
    if (counting) {
      t.used += dt; sinceSave += dt;
      if (sinceSave >= 5) { saveT(); sinceSave = 0; }
    }
    update();
  }
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", saveT);
  window.addEventListener("pagehide", saveT);

  // The tablet's Back button. Returns "home" when there is nothing left to close.
  window.__kidsBack = function () {
    if (locked) { view("done"); return "ok"; }
    if (isOpen("player")) { $("backBtn").click(); return "ok"; }
    if (isOpen("gate")) { $("gateCancel").click(); return "ok"; }
    if (isOpen("parent")) { $("parentDone").click(); return "ok"; }
    var s = $("search");
    if (s && s.value) { s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); return "ok"; }
    return "home";
  };

  tick();
})();
