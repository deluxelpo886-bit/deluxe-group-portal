/* Deluxe Ops — in-app morning alarm (shared across every page).
 *
 * Rings inside the app with no email/WhatsApp/server setup. It fires when the
 * app is open on ANY page at the set time, and the moment you open the app after
 * that time if it hasn't rung yet today. It keeps beeping + vibrating until you
 * dismiss it. Settings and the last-fired date live on this device.
 *
 * A phone cannot let a website ring while the app is fully closed — for that,
 * use the email reminder. This covers the practical case: you open Deluxe Ops
 * in the morning and it greets you with the alarm.
 */
(function () {
  var ENGINE = 'v4';
  var ALM = 'deluxeAlarm';
  var TOKEN = (function () { try { return localStorage.getItem('deluxeFleetToken') || ''; } catch (e) { return ''; } })();
  var $ = function (id) { return document.getElementById(id); };
  function get() { try { return JSON.parse(localStorage.getItem(ALM) || '{}') || {}; } catch (e) { return {}; } }
  function set(o) { try { localStorage.setItem(ALM, JSON.stringify(o)); } catch (e) {} }
  function today() { return new Date().toLocaleDateString('en-CA'); }
  function nowMins() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function hhmm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function toMins(s) { var p = String(s || '07:00').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }

  // Housekeeping: a firedDate left over from a PREVIOUS day must never suppress
  // today's ring. Clear it on load so a stale flag can't keep the alarm silent.
  (function () { var a = get(); if (a.firedDate && a.firedDate !== today()) { delete a.firedDate; set(a); } })();

  // Unlock audio on the very first tap anywhere, so a scheduled ring (which has
  // no user gesture of its own) is allowed to make sound by the browser.
  var audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      audioUnlocked = true;
    } catch (e) {}
  }
  document.addEventListener('pointerdown', unlockAudio, { once: false });
  document.addEventListener('touchstart', unlockAudio, { once: false });
  document.addEventListener('click', unlockAudio, { once: false });

  // ---- due count (best-effort; cached) ----
  var due = { over: null, soon: null };
  function daysTo(dstr) { if (!dstr) return null; return Math.round((new Date(dstr + 'T00:00:00') - new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00')) / 86400000); }
  function refreshDue() {
    if (!TOKEN) return;
    fetch('/api/service/status', { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + TOKEN } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.generators) return;
        var over = 0, soon = 0;
        d.generators.forEach(function (g) {
          if (g.offHire) return;
          var t = daysTo(g.nextServiceDate);
          if (t == null) return;
          if (t < 0) over++; else if (t <= 7) soon++;
        });
        due.over = over; due.soon = soon;
      }).catch(function () {});
  }

  // ---- sound (Web Audio; loops until stopped) ----
  var actx = null, ringTimer = null;
  function ding() {
    var a = get(); if (a.sound === false) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      for (var i = 0; i < 4; i++) {
        var t = actx.currentTime + i * 0.34;
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = (i % 2 ? 988 : 784);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.3);
      }
    } catch (e) {}
  }
  function startRing() {
    ding();
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
    stopRing();
    var count = 0;
    ringTimer = setInterval(function () {
      count++;
      ding();
      try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
      if (count >= 20) stopRing(); // stop after ~40s if left alone
    }, 2000);
  }
  function stopRing() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }

  // ---- overlay (created once, on any page) ----
  var ov = null;
  function buildOverlay() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'deluxeAlarmOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(8,10,14,.94);display:none;align-items:center;justify-content:center;z-index:2147483000;padding:20px;';
    ov.innerHTML =
      '<div style="max-width:430px;width:100%;background:#151b23;border:2px solid #f2ab3c;border-radius:20px;padding:28px 24px;text-align:center;box-shadow:0 26px 70px -20px #000;font-family:Manrope,system-ui,sans-serif;color:#eef3f8;">'
      + '<div style="font-size:46px;line-height:1;">⏰</div>'
      + '<h2 id="dxAlmTitle" style="margin:10px 0 8px;font-size:22px;">Good morning</h2>'
      + '<div id="dxAlmBody" style="font-size:15px;line-height:1.6;margin-bottom:20px;"></div>'
      + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">'
      + '<a href="/plan" id="dxAlmPlan" style="text-decoration:none;background:linear-gradient(180deg,#f8bd57,#f0a02f);color:#231500;border:none;padding:11px 16px;border-radius:11px;font-weight:800;">🧭 Open plan</a>'
      + '<button id="dxAlmSnooze" style="background:#1b232d;color:#eef3f8;border:1px solid #28313c;padding:11px 16px;border-radius:11px;font-weight:700;cursor:pointer;">😴 Snooze 10 min</button>'
      + '<button id="dxAlmDismiss" style="background:#1b232d;color:#eef3f8;border:1px solid #28313c;padding:11px 16px;border-radius:11px;font-weight:700;cursor:pointer;">Dismiss</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    $('dxAlmDismiss').addEventListener('click', function () { hide(); var a = get(); a.firedDate = today(); delete a.snooze; set(a); });
    $('dxAlmSnooze').addEventListener('click', function () { hide(); var a = get(); a.snooze = Date.now() + 10 * 60000; delete a.firedDate; set(a); });
    $('dxAlmPlan').addEventListener('click', function () { stopRing(); });
    return ov;
  }
  function hide() { stopRing(); if (ov) ov.style.display = 'none'; }
  function dueText() {
    if (due.over == null) return 'Open the plan to see what’s due for service today.';
    if (due.over) return '<b style="color:#f0664a;">' + due.over + ' overdue</b>' + (due.soon ? (' · ' + due.soon + ' due within 7 days') : '');
    if (due.soon) return '<b style="color:#f2ab3c;">' + due.soon + ' due within 7 days</b>';
    return 'No services due right now. 👍';
  }
  function fire() {
    buildOverlay();
    $('dxAlmTitle').textContent = '⏰ Good morning';
    $('dxAlmBody').innerHTML = 'Service check for today:<br><br>' + dueText() + '<br><br><span style="color:#8a99ab;font-size:12.5px;">Tap Open plan to send the teams.</span>';
    ov.style.display = 'flex';
    startRing();
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Deluxe Ops — Morning service check', { body: (due.over != null ? (due.over + ' overdue, ' + due.soon + ' due soon') : 'Open the app to check services'), icon: '/icon-192.png' }); } catch (e) {}
  }

  // Live status line (shown on the dashboard panel). Kept at module scope so
  // both the panel wiring and every check() tick refresh the same text.
  function renderStatus() {
    var el = $('almStatus'); if (!el) return;
    var b = get();
    if (!b.on) { el.style.color = '#8a99ab'; el.textContent = 'Alarm off. Turn it on for a morning ring with today’s due list. (engine ' + ENGINE + ')'; return; }
    var tgt = b.time || '07:00';
    var mins = toMins(tgt) - nowMins();
    var firedToday = b.firedDate === today();
    var line;
    if (firedToday) line = '✓ On — already rang today at ' + tgt + '. Will ring again tomorrow.';
    else if (mins > 0) line = '✓ On — armed. Rings at ' + tgt + ' (in ' + mins + ' min) while the app is open. Now ' + hhmm() + '.';
    else line = '✓ On — armed. It is past ' + tgt + '; will ring within ~30s while the app is open. Now ' + hhmm() + '.';
    el.style.color = '#37d99a';
    el.textContent = line + ' (engine ' + ENGINE + ')';
  }

  function check() {
    renderStatus();
    var a = get(); if (!a.on) return;
    if (ov && ov.style.display === 'flex') return;
    if (a.snooze && Date.now() < a.snooze) return;
    var pastTime = nowMins() >= toMins(a.time || '07:00');
    var firedToday = a.firedDate === today();
    var snoozeReady = a.snooze && Date.now() >= a.snooze;
    if ((pastTime && !firedToday) || snoozeReady) {
      // Mark the day as rung ONLY for the real scheduled alarm (not for Test),
      // so testing never suppresses today's real ring.
      var b = get(); b.firedDate = today(); delete b.snooze; set(b);
      fire();
    }
  }

  // ---- wire the settings panel if this page has it (dashboard) ----
  function wirePanel() {
    if (!$('almOn')) return;
    var a = get();
    $('almOn').checked = !!a.on;
    $('almTime').value = a.time || '07:00';
    if ($('almSound')) $('almSound').checked = a.sound !== false;
    function save() {
      var b = get(); b.on = $('almOn').checked; b.time = $('almTime').value || '07:00'; if ($('almSound')) b.sound = $('almSound').checked;
      // Re-arm for today whenever settings change (so a new time can still fire today).
      delete b.firedDate; delete b.snooze;
      set(b); renderStatus();
      if (b.on && 'Notification' in window && Notification.permission === 'default') { Notification.requestPermission().catch(function () {}); }
      setTimeout(check, 500);
    }
    $('almOn').addEventListener('change', save);
    $('almTime').addEventListener('change', save);
    if ($('almSound')) $('almSound').addEventListener('change', save);
    if ($('almTest')) $('almTest').addEventListener('click', function () {
      unlockAudio();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(function () {});
      refreshDue(); fire();
    });
    renderStatus();
  }

  // ---- boot ----
  function boot() {
    wirePanel();
    refreshDue();
    setTimeout(check, 2000);        // shortly after load
    setInterval(check, 15000);      // and every 15s while open
    setInterval(refreshDue, 300000); // keep the count fresh
    // re-check when the app is brought back to the foreground
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refreshDue(); setTimeout(check, 800); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
