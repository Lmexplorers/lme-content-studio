/**
 * LME Autopilot, veien til kjøp. Ingen priser i appen.
 * ==========================================================================
 *
 * HVORFOR APPEN IKKE VISER PRISER LENGER
 *
 * Renate 1. september 2026: "Fortsatt prising i appen. Skal det ikke være
 * på plattforma?" Jo. Prisene sto tre steder: `functions/_lib/plans.js` og
 * /oppgrader i lme-platform, og her. Tre kopier av det samme tallet driver
 * fra hverandre til slutt, og det har skjedd før: appen viste 299, 499 og
 * 699 mens plattformen solgte de samme planene til 199, 549 og 999.
 *
 * Nå står prisen ett sted, på lmexplorers.com, og appen sender kunden dit.
 * Tre ting blir riktige på én gang:
 *
 *   1. Én pris. Endrer Renate den på plattformen, er den endret overalt.
 *   2. Kjøpet går gjennom plattformen, der Vipps, webhooken som faktisk gir
 *      tilgang, kvitteringen og oppfølgingsserien ligger. Et kjøp gjort
 *      utenom den veien gir ikke kunden tilgang i det hele tatt.
 *   3. Butikkappen holder seg utenfor Apples regel 3.1.1 og Googles
 *      betalingspolicy, siden det verken finnes priser eller kjøpsknapper
 *      inne i appen.
 *
 * SKAL EN PRIS ENDRES: `functions/_lib/plans.js` og /oppgrader i
 * lme-platform, og i Stripe. Ikke her, for her finnes ingen.
 *
 * ==========================================================================
 * BUTIKKMODUS (App Store og Google Play)
 *
 * Renate valgte 26. august 2026 at butikkappen bare skal ha innlogging,
 * uten priser og uten kjøpsknapper. Der skjules også lenken ut, siden begge
 * butikkene regner en slik lenke som omgåelse av betalingssystemet deres.
 *
 * Butikkmodus slås på når appen kjøres som installert app, eller med
 * `?store=1` i adressen (som lagres, så den overlever navigering).
 * `?store=0` slår den av igjen. I butikkmodus skjules alt som er merket
 * `data-lme-kjop`, og boksene under rendres ikke.
 * ==========================================================================
 */
(function () {
  "use strict";

  var OPPGRADER = "https://lmexplorers.com/oppgrader";
  var INNER_CIRCLE = "https://lmexplorers.com/community";

  var TEKST = {
    no: {
      tittel: "Se planer og priser",
      tekst: "Abonnementene og engangskjøpet ligger på lmexplorers.com, sammen med Vipps og kortbetaling. Du kommer rett tilbake hit etterpå.",
      knapp: "Se planer og priser →",
      icTittel: "Mer enn verktøyene",
      icTekst: "Inner Circle gir deg resten av LME: hele biblioteket, fellesskapet og månedlige live-samtaler med Renate.",
      icKnapp: "Se Inner Circle →"
    },
    en: {
      tittel: "See plans and prices",
      tekst: "The subscriptions and the one-time purchase live on lmexplorers.com, together with card payment. You come straight back here afterwards.",
      knapp: "See plans and prices →",
      icTittel: "More than the tools",
      icTekst: "The Inner Circle gives you the rest of LME: the full library, the community and monthly live calls with Renate.",
      icKnapp: "See the Inner Circle →"
    }
  };

  /* ---------- butikkmodus ---------- */

  function erButikkbygg() {
    try {
      var p = new URLSearchParams(window.location.search);
      if (p.get("store") === "1") localStorage.setItem("lme-butikkbygg", "1");
      if (p.get("store") === "0") localStorage.removeItem("lme-butikkbygg");
      if (localStorage.getItem("lme-butikkbygg") === "1") return true;
    } catch (e) { /* privat modus, går videre på visningssjekken under */ }
    try {
      if (window.navigator.standalone === true) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
      if (document.referrer && document.referrer.indexOf("android-app://") === 0) return true;
    } catch (e) {}
    return false;
  }

  /* ---------- hjelpere ---------- */

  function sprak(el) {
    var s = el && el.getAttribute("data-lme-sprak");
    if (s) return s === "en" ? "en" : "no";
    var d = (document.documentElement.getAttribute("lang") || "").toLowerCase();
    if (d.indexOf("en") === 0) return "en";
    if (d.indexOf("no") === 0 || d.indexOf("nb") === 0) return "no";
    return /\/en(\.html)?$/.test(window.location.pathname) ? "en" : "no";
  }

  function boks(lang) {
    var t = TEKST[lang];
    return (
      '<div style="background:#fff;border:1px solid rgba(90,56,37,.12);border-radius:20px;' +
        'padding:22px;text-align:center;">' +
        '<div style="font-family:\'Playpen Sans\',sans-serif;font-weight:800;font-size:18px;' +
          'color:#C81860;margin-bottom:8px;">' + t.tittel + "</div>" +
        '<p style="font-size:14px;line-height:1.6;color:#6B6470;margin:0 0 16px;">' + t.tekst + "</p>" +
        '<a href="' + OPPGRADER + '" target="_blank" rel="noopener" ' +
          'style="display:inline-block;background:#F02478;color:#fff;text-decoration:none;' +
          'font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px;">' + t.knapp + "</a>" +
      "</div>" +
      '<div style="background:#FCE4EE;border-radius:18px;padding:18px;margin-top:14px;text-align:center;">' +
        '<div style="font-family:\'Playpen Sans\',sans-serif;font-weight:700;font-size:15px;' +
          'color:#C81860;margin-bottom:6px;">' + t.icTittel + "</div>" +
        '<p style="font-size:13px;line-height:1.6;color:#6B6470;margin:0 0 12px;">' + t.icTekst + "</p>" +
        '<a href="' + INNER_CIRCLE + '" target="_blank" rel="noopener" ' +
          'style="color:#C81860;font-weight:700;font-size:13.5px;text-decoration:none;">' + t.icKnapp + "</a>" +
      "</div>"
    );
  }

  /* ---------- montering ---------- */

  function monter() {
    var butikk = erButikkbygg();

    if (butikk && !document.querySelector("style[data-lme-butikkbygg]")) {
      var s = document.createElement("style");
      s.setAttribute("data-lme-butikkbygg", "1");
      s.textContent = "[data-lme-kjop]{display:none !important;}";
      document.head.appendChild(s);
      document.documentElement.setAttribute("data-lme-butikkbygg", "1");
    }

    var mount = document.querySelectorAll("[data-lme-priser]");
    for (var i = 0; i < mount.length; i++) {
      var el = mount[i];
      if (butikk) { el.innerHTML = ""; continue; }
      el.innerHTML = boks(sprak(el));
    }
  }

  window.LME_PRISER = {
    /* Prisene bor på plattformen. Står tomt her med vilje, så ingen fristes
       til å legge dem inn igjen. */
    planer: [],
    oppgrader: OPPGRADER,
    erButikkbygg: erButikkbygg,
    monter: monter
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", monter);
  } else {
    monter();
  }

  /* Språkbyttet i appen setter lang på html-elementet. Da tegnes boksen på
     nytt, slik prislisten gjorde før. */
  try {
    new MutationObserver(monter).observe(document.documentElement, {
      attributes: true, attributeFilter: ["lang"]
    });
  } catch (e) {}
})();
