/**
 * Hent designet ditt rett fra Canva-kontoen din.
 *
 * ==========================================================================
 * HVA DEN GJØR
 * ==========================================================================
 * Canva-fanen kunne fra før ta imot en fil du hadde lastet ned selv, eller en
 * lenke du limte inn. Denne legger til den siste veien: velg designet i en
 * liste, så hentes bildet og legges rett i feltet, uten nedlasting og
 * opplasting.
 *
 * Renate 22. september 2026: "flere koblinger til Canva i appene. LME
 * Autopilot og Bookly."
 *
 * ==========================================================================
 * HVORFOR DET ER ET VINDU OG IKKE ET KALL
 * ==========================================================================
 * Selve koblingen til Canva bor på lmexplorers.com, der innloggingen og
 * nøklene ligger. Denne appen kjører på et annet domene, og
 * innloggingskaken der er satt med SameSite=Lax. Lax betyr at kaken IKKE
 * følger med på et kall fra et annet domene, men den følger med når
 * nettleseren åpner en side. Derfor åpner vi en side i stedet for å kalle:
 * velgeren åpnes i et lite vindu, du velger designet der, og bildet sendes
 * tilbake hit.
 *
 * Bildet tas bare imot fra VELGER-adressen under. En melding fra hvilken som
 * helst annen side blir liggende urørt.
 *
 * ==========================================================================
 * INGEN MØTER EN KNAPP SOM IKKE VIRKER
 * ==========================================================================
 * Er koblingen ikke satt opp på plattformen, sier velgeren det selv når den
 * åpnes, med veien videre. Knappen her lover ingenting mer enn at den åpner
 * velgeren.
 */
(function () {
  if (window.__lmeCanvaKonto) return;
  window.__lmeCanvaKonto = true;

  var PLATTFORM = "https://lmexplorers.com";
  var VELGER = PLATTFORM + "/canva-velger?v=1&retur=";

  /* Appen finnes på norsk og engelsk som hver sin fil. Språket leses av
     adressen, slik resten av appen gjør det. */
  function en() {
    return /(^|\/)en(\.html)?$/.test(location.pathname) ||
      (document.documentElement.getAttribute("lang") || "").toLowerCase().indexOf("en") === 0;
  }
  function t(no, eng) { return en() ? eng : no; }

  var venter = null;   /* { felt, flere } mens vinduet står åpent */
  var samlet = [];     /* karusellen: bildene som er hentet så langt */

  function dataUrlTilFil(dataUrl, navn) {
    var delt = String(dataUrl).split(",");
    var type = (delt[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
    var binaer = atob(delt[1]);
    var bytes = new Uint8Array(binaer.length);
    for (var i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
    return new File([bytes], navn, { type: type });
  }

  /* Legger filene i feltet og sier fra på samme måte som nettleseren gjør
     når du velger en fil selv, så appens egen kode tar over derfra. */
  function leggIFelt(felt, filer) {
    try {
      var dt = new DataTransfer();
      filer.forEach(function (f) { dt.items.add(f); });
      felt.files = dt.files;
    } catch (e) {
      return false;
    }
    felt.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function si(boks, tekst, erFeil) {
    var s = boks.querySelector(".canva-status");
    if (!s) return;
    s.style.display = "block";
    s.className = "canva-status " + (erFeil ? "err" : "ok");
    s.textContent = tekst;
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== PLATTFORM) return;
    var d = e.data;
    if (!d || d.type !== "lme-canva-bilde" || !d.bilde) return;
    if (!venter) return;

    var navn = String(d.navn || "canva").replace(/[^\wæøåÆØÅ \-]/g, "").trim().slice(0, 60) || "canva";
    var fil = dataUrlTilFil(d.bilde, navn + ".jpg");
    var boks = venter.felt.closest(".canva-import-box");

    if (venter.flere) {
      samlet.push(fil);
      if (!leggIFelt(venter.felt, samlet)) {
        si(boks, t("Nettleseren din lot meg ikke legge bildet i feltet. Last det ned fra Canva og velg det her i stedet.",
                   "Your browser would not let me put the picture in the field. Download it from Canva and choose it here instead."), true);
        return;
      }
      si(boks, t("Hentet ", "Fetched ") + samlet.length +
        (samlet.length === 1 ? t(" bilde fra Canva.", " picture from Canva.") : t(" bilder fra Canva.", " pictures from Canva.")) +
        t(" Hent gjerne flere, eller bruk dem i editoren.", " Fetch more, or use them in the editor."));
    } else {
      if (!leggIFelt(venter.felt, [fil])) {
        si(boks, t("Nettleseren din lot meg ikke legge bildet i feltet. Last det ned fra Canva og velg det her i stedet.",
                   "Your browser would not let me put the picture in the field. Download it from Canva and choose it here instead."), true);
        return;
      }
    }
    venter = null;
  });

  function apneVelger(felt, flere) {
    venter = { felt: felt, flere: flere };
    if (!flere) samlet = [];
    var v = window.open(VELGER + encodeURIComponent(location.origin), "lme-canva", "width=560,height=720");
    if (!v) {
      var boks = felt.closest(".canva-import-box");
      si(boks, t("Nettleseren blokkerte vinduet. Tillat sprettoppvinduer for denne siden, og prøv en gang til.",
                 "Your browser blocked the window. Allow pop-ups for this page and try again."), true);
      venter = null;
    }
  }

  function knapp(tekst, ved) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "canva-btn";
    b.style.marginBottom = "10px";
    b.textContent = tekst;
    b.addEventListener("click", ved);
    return b;
  }

  function settInn() {
    var bokser = document.querySelectorAll(".canva-import-box");
    for (var i = 0; i < bokser.length; i++) {
      var boks = bokser[i];
      if (boks.__lmeCanva) continue;
      var felt = boks.querySelector(".canva-drop-input");
      if (!felt) continue;

      /* Bare der feltet faktisk vil ha et bilde. Reel-boksen tar en
         ferdig video, og den kan ikke hentes som et bilde. */
      var tar = (felt.getAttribute("accept") || "").toLowerCase();
      if (tar.indexOf("image/") === -1) continue;

      boks.__lmeCanva = true;
      var flere = felt.hasAttribute("multiple");
      var sone = boks.querySelector(".canva-drop-zone");
      var k = knapp(
        flere ? t("Hent bilder fra Canva-kontoen min", "Get pictures from my Canva account")
              : t("Hent design fra Canva-kontoen min", "Get a design from my Canva account"),
        (function (f, m) { return function () { apneVelger(f, m); }; })(felt, flere)
      );
      if (sone && sone.parentNode) sone.parentNode.insertBefore(k, sone);
      else boks.appendChild(k);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", settInn);
  } else {
    settInn();
  }
})();
