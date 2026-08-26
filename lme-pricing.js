/**
 * LME Autopilot, én kilde for hva appen koster.
 * ==========================================================================
 *
 * HVORFOR DENNE FILEN FINNES
 *
 * Prisene lå hardkodet seks steder: låseskjermen, prismodalen og prisfanen,
 * i både no.html og en.html. De hadde drevet fra hverandre og viste 299, 499
 * og 699 kr, altså de gamle prisene. Samtidig solgte /oppgrader på
 * lmexplorers.com de samme planene til 199, 549 og 999 kr gjennom Stripe.
 * Kjøpsknappene i appen pekte i tillegg på FEA Create, ikke på Stripe, så et
 * kjøp gjort inne i appen traff aldri webhooken som faktisk gir tilgang.
 *
 * Derfor: prisene står her, ett sted, og speiler
 * `functions/_lib/plans.js` og `/oppgrader` i lme-platform. Skal en pris
 * endres, endres den her, i plans.js, på /oppgrader og i Stripe, ikke i seks
 * HTML-blokker.
 *
 * NÅR DU ENDRER EN PRIS: oppdater `PRISER_SJEKKET` også.
 *
 * ==========================================================================
 * BUTIKKMODUS (App Store og Google Play)
 *
 * Renate valgte 26. august 2026 at butikkappen bare skal ha innlogging, uten
 * priser og uten kjøpsknapper. Da holder appen seg utenfor både Apples
 * regel 3.1.1 og Googles betalingspolicy, og hele salget blir hennes.
 * Kjøp skjer på lmexplorers.com.
 *
 * Butikkmodus slås på når appen kjøres som installert app, eller med
 * `?store=1` i adressen (som lagres, så den overlever navigering).
 * `?store=0` slår den av igjen. I butikkmodus skjules alt som er merket
 * `data-lme-kjop`, og planlistene rendres ikke.
 * ==========================================================================
 */
(function () {
  "use strict";

  /* Video følger IKKE med i noen plan. Bestemt av Renate 26. august 2026:
     hun kan ikke kjøpe videogenerering for en hel kundemasse. Kunden
     bruker egen video-nøkkel, eller kjøper videokreditt. Appen håndhever
     det samme i PLAN_CAPS i functions/api/generate.js, så ikke lov video
     som inkludert her uten å endre begge steder. */
  var PRISER_SJEKKET = "2026-08-26";

  /* Planene. `nok` og `usd` er hele kroner og dollar. `lenke` er den levende
     Stripe-betalingslenken, hentet 1:1 fra /oppgrader i lme-platform, som er
     den eneste kjøpsveien som treffer webhooken og gir tilgang. */
  var PLANER = [
    {
      id: "start",
      merke: null,
      navn: { no: "Start", en: "Start" },
      under: {
        no: "For deg som vil begynne å lage innhold med AI.",
        en: "For getting started with AI content."
      },
      nok: 199, usd: 19, interval: "month",
      lenke: {
        no: "https://buy.stripe.com/dRmcN62FL3R53XT1ST9R70P",
        en: "https://buy.stripe.com/fZu00k949bjxdyteFF9R70Q"
      },
      arlig: {
        nok: 1990, usd: 190,
        lenke: {
          no: "https://buy.stripe.com/9B6eVe1BHevJ1PL8hh9R70L",
          en: "https://buy.stripe.com/7sY6oIdkpcnB1PL5559R70M"
        },
        notat: { no: "spar to måneder", en: "save two months" }
      },
      punkter: {
        no: ["30 AI-bilder i måneden", "Video med egen nøkkel eller kjøpt kreditt", "30-dagers innholdsplan",
             "AI-tekst i alle formater", "Norsk og engelsk innhold"],
        en: ["30 AI images a month", "Video with your own key or bought credit", "30-day content plan",
             "AI copy in every format", "Norwegian and English content"]
      }
    },
    {
      id: "proff",
      merke: { no: "MEST POPULÆR", en: "MOST POPULAR" },
      navn: { no: "Proff", en: "Pro" },
      under: {
        no: "Det komplette innholdssystemet for aktive skapere.",
        en: "The complete content system for active creators."
      },
      nok: 549, usd: 54, interval: "month",
      lenke: {
        no: "https://buy.stripe.com/eVq00k8055Zd51XgNN9R70R",
        en: "https://buy.stripe.com/14A3cwcgl5ZdfGBfJJ9R70S"
      },
      arlig: {
        nok: 5490, usd: 540,
        lenke: {
          no: "https://buy.stripe.com/3cI9AUeot5Zd8e96999R70N",
          en: "https://buy.stripe.com/00w9AUfsxfzNcupfJJ9R70O"
        },
        notat: { no: "spar to måneder", en: "save two months" }
      },
      punkter: {
        no: ["Alt i Start, pluss:", "100 AI-bilder i måneden", "Video med egen nøkkel eller kjøpt kreditt",
             "90-dagers innholdsplan", "Reel-editor og autopublisering",
             "Karakterkonsistens for dine egne figurer"],
        en: ["Everything in Start, plus:", "100 AI images a month", "Video with your own key or bought credit",
             "90-day content plan", "Reel editor and auto-publishing",
             "Character consistency for your own characters"]
      }
    },
    {
      id: "vip",
      merke: null,
      navn: { no: "VIP", en: "VIP" },
      under: {
        no: "For deg som lager mye innhold, med høyest kvote.",
        en: "For high-volume creators, with the highest quota."
      },
      nok: 999, usd: 99, interval: "month",
      lenke: {
        no: "https://buy.stripe.com/4gM9AUa8d87l1PLbtt9R70T",
        en: "https://buy.stripe.com/cNiaEY5RX1IX0LH6999R70U"
      },
      arlig: {
        nok: 9990, usd: 990,
        lenke: {
          no: "https://buy.stripe.com/3cI7sM2FL2N1eCx2WX9R70V",
          en: "https://buy.stripe.com/eVqeVe1BH73h661btt9R70W"
        },
        notat: { no: "spar to måneder", en: "save two months" }
      },
      punkter: {
        no: ["Alt i Proff, pluss:", "250 AI-bilder i måneden", "Video med egen nøkkel eller kjøpt kreditt",
             "Høyest kvote og prioritert generering"],
        en: ["Everything in Pro, plus:", "250 AI images a month", "Video with your own key or bought credit",
             "Highest quota and priority generation"]
      }
    }
  ];

  var TEKST = {
    no: {
      tittel: "Abonnementer",
      perMnd: "per måned",
      perAr: "per år",
      mnd: "mnd",
      ar: "år",
      velg: "Velg ",
      arligKnapp: "årlig",
      ingenBinding: "Ingen binding, avbryt når som helst.",
      sjekket: "Priser sist sjekket ",
      icTittel: "Mer enn verktøyene",
      icTekst: "Inner Circle gir deg resten av LME: hele biblioteket, fellesskapet og månedlige live-samtaler med Renate.",
      icKnapp: "Se Inner Circle →"
    },
    en: {
      tittel: "Subscriptions",
      perMnd: "per month",
      perAr: "per year",
      mnd: "mo",
      ar: "yr",
      velg: "Choose ",
      arligKnapp: "yearly",
      ingenBinding: "No lock-in, cancel anytime.",
      sjekket: "Prices last checked ",
      icTittel: "More than the tools",
      icTekst: "The Inner Circle gives you the rest of LME: the full library, the community and monthly live calls with Renate.",
      icKnapp: "See the Inner Circle →"
    }
  };

  var INNER_CIRCLE = "https://lmexplorers.com/community";

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

  /* 9990 -> "9 990". Mellomrom som tusenskille, slik prisene alltid har stått. */
  function tall(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function pris(p, lang) {
    return lang === "en" ? "$" + tall(p.usd) : tall(p.nok) + " kr";
  }

  function arligPris(p, lang) {
    return lang === "en" ? "$" + tall(p.arlig.usd) : tall(p.arlig.nok) + " kr";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- variant "liste", låseskjermen ---------- */

  function liste(lang) {
    var t = TEKST[lang];
    var h = '<div style="font-size:13px;font-weight:700;color:#C81860;margin-bottom:10px;text-align:center;">' + t.tittel + "</div>";

    PLANER.forEach(function (p) {
      var uthevet = p.id === "proff";
      h += '<a href="' + p.lenke[lang] + '" target="_top" rel="noopener" style="display:flex;justify-content:space-between;align-items:center;'
        + (uthevet
            ? "background:linear-gradient(120deg,#FCE4EE 0%,#FFFBEF 100%);border:2px solid #F02478;"
            : "background:#fff;border:2px solid #E8E0E5;")
        + 'border-radius:12px;padding:12px 14px;text-decoration:none;margin-bottom:8px;position:relative;">';
      if (p.merke) {
        h += '<div style="position:absolute;top:-8px;right:12px;background:#C81860;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:8px;">' + esc(p.merke[lang]) + "</div>";
      }
      h += '<div style="text-align:left;"><div style="font-weight:700;color:#1A1A1A;font-size:14px;">' + esc(p.navn[lang]) + "</div>"
        + '<div style="font-size:11px;color:#6B6470;">' + esc(p.punkter[lang][p.id === "start" ? 0 : 1]) + "</div></div>"
        + '<div style="font-weight:700;color:#C81860;font-size:15px;white-space:nowrap;">' + pris(p, lang) + "/" + t.mnd + "</div></a>";
    });

    var vip = PLANER.filter(function (x) { return x.id === "vip"; })[0];
    h += '<a href="' + vip.arlig.lenke[lang] + '" target="_top" rel="noopener" style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(120deg,#F02478 0%,#C81860 100%);color:#fff;border-radius:12px;padding:14px;text-decoration:none;margin-bottom:16px;">'
      + '<div style="text-align:left;"><div style="font-weight:700;font-size:14px;">' + esc(vip.navn[lang]) + " " + (lang === "en" ? "yearly" : "årlig") + "</div>"
      + '<div style="font-size:11px;opacity:.9;">' + esc(vip.arlig.notat[lang]) + "</div></div>"
      + '<div style="font-weight:700;font-size:15px;white-space:nowrap;">' + arligPris(vip, lang) + "/" + t.ar + "</div></a>";

    h += '<div style="font-size:11px;color:#6B6470;text-align:center;margin-bottom:4px;">' + t.ingenBinding + "</div>";
    return h;
  }

  /* ---------- variant "kort", prismodalen og prisfanen ---------- */

  function kort(lang) {
    var t = TEKST[lang];
    var h = "";

    PLANER.forEach(function (p) {
      var uthevet = p.id === "proff";
      var kant = uthevet ? "2.5px solid var(--rose)" : "2px solid var(--border)";
      var bg = uthevet ? "linear-gradient(160deg,var(--rose-l) 0%,white 100%)" : "#fff";

      h += '<div class="card" style="border:' + kant + ";background:" + bg + ';margin-bottom:14px;position:relative;">';
      if (p.merke) {
        h += '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,var(--rose),var(--rose-d));color:white;border-radius:20px;padding:4px 16px;font-size:11px;font-weight:700;white-space:nowrap;">' + esc(p.merke[lang]) + "</div>";
      }
      h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;margin-top:8px;gap:12px;">'
        + '<div><div style="font-family:\'Playpen Sans\';font-size:18px;font-weight:900;color:var(--rose-d);">' + esc(p.navn[lang]) + "</div>"
        + '<div style="font-size:11px;color:var(--text-s);margin-top:2px;">' + esc(p.under[lang]) + "</div></div>"
        + '<div style="text-align:right;flex-shrink:0;"><div style="font-family:\'Playpen Sans\';font-size:28px;font-weight:900;color:var(--rose-d);white-space:nowrap;">' + pris(p, lang) + "</div>"
        + '<div style="font-size:10px;color:var(--text-s);">' + t.perMnd + "</div></div></div>";

      h += '<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:16px;font-size:12px;">';
      p.punkter[lang].forEach(function (linje, i) {
        var sterk = i === 0 && /:$/.test(linje);
        h += '<div><span style="color:var(--sage-d);">✅</span> ' + (sterk ? "<strong>" + esc(linje) + "</strong>" : esc(linje)) + "</div>";
      });
      h += "</div>";

      h += '<a href="' + p.lenke[lang] + '" target="_top" rel="noopener" style="display:block;width:100%;padding:14px;border-radius:13px;text-align:center;'
        + (uthevet
            ? "background:linear-gradient(110deg,var(--rose),var(--rose-d));color:white;box-shadow:0 6px 20px rgba(240,36,120,.4);"
            : "background:white;border:2px solid var(--rose);color:var(--rose-d);")
        + 'font-family:\'Sasson Montessori\';font-size:14px;font-weight:900;text-decoration:none;">'
        + esc(t.velg + p.navn[lang]) + " →</a>";

      if (p.arlig) {
        h += '<a href="' + p.arlig.lenke[lang] + '" target="_top" rel="noopener" style="display:block;width:100%;margin-top:8px;padding:11px;border-radius:13px;text-align:center;background:linear-gradient(110deg,var(--gold),#D9A500);color:white;font-family:\'Sasson Montessori\';font-size:13px;font-weight:700;text-decoration:none;">'
          + esc(t.velg + p.navn[lang] + " " + t.arligKnapp) + ", " + arligPris(p, lang) + " " + t.perAr + " →</a>";
      }
      h += "</div>";
    });

    h += '<div class="card" style="border:2px solid var(--border);background:linear-gradient(160deg,#FFF4F6,#FBF6F0);margin-bottom:14px;text-align:center;">'
      + '<div style="font-family:\'Playpen Sans\';font-size:16px;font-weight:900;color:var(--rose-d);margin-bottom:6px;">' + esc(t.icTittel) + "</div>"
      + '<div style="font-size:12px;color:var(--text-s);line-height:1.6;margin-bottom:12px;">' + esc(t.icTekst) + "</div>"
      + '<a href="' + INNER_CIRCLE + '" target="_blank" rel="noopener" style="display:inline-block;padding:11px 20px;border-radius:13px;background:white;border:2px solid var(--rose);color:var(--rose-d);font-family:\'Sasson Montessori\';font-size:13px;font-weight:700;text-decoration:none;">'
      + esc(t.icKnapp) + "</a></div>";

    h += '<div style="text-align:center;font-size:11px;color:var(--text-s);margin-top:10px;line-height:1.6;">'
      + t.ingenBinding + "<br/>" + t.sjekket + PRISER_SJEKKET + "</div>";

    return h;
  }

  /* ---------- montering ---------- */

  function monter() {
    var butikk = erButikkbygg();

    if (butikk) {
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
      var lang = sprak(el);
      el.innerHTML = el.getAttribute("data-lme-priser") === "liste" ? liste(lang) : kort(lang);
    }
  }

  window.LME_PRISER = {
    planer: PLANER,
    sjekket: PRISER_SJEKKET,
    erButikkbygg: erButikkbygg,
    monter: monter
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", monter);
  } else {
    monter();
  }
})();
