# Innsending til App Store og Google Play

Praktisk sjekkliste for å sende LME Content Studio til de to butikkene. Appen er en
PWA (nettapp), så vi pakker den inn i en app-fil med PWABuilder. Det er gratis og
samme verktøy dekker begge butikkene.

> Appens URL: `https://lme-contentstudio.pages.dev`
> Personvern-siden ligger på `https://lme-contentstudio.pages.dev/personvern`.

## Status: hva er klart nå

- App-ikoner (72 til 512 px, inkludert maskable) er på plass og lenket riktig i `manifest.json`.
- `manifest.json` har navn, beskrivelse, farger, kategori og `id`. Klar for innpakking.
- Personvernerklæring (norsk og engelsk) er laget og ligger på `/personvern`. Begge
  butikkene krever en slik offentlig lenke.
- Service worker og offline-skall fungerer.

## Det du trenger før innsending

- Google Play: utviklerkonto (engangsavgift, allerede betalt siden appen ble sendt
  inn før).
- App Store: Apple-utviklerkonto (999 kr i året) og tilgang til en Mac med Xcode.
  Uten Mac kan vi bruke en sky-Mac-tjeneste, men en lånt Mac er enklest.
- Skjermbilder av appen (se eget punkt under).

## Steg 1: lag app-filene med PWABuilder

1. Gå til [pwabuilder.com](https://www.pwabuilder.com).
2. Lim inn appens URL og kjør analysen. Den skal nå gi grønt på ikoner og manifest.
3. Velg "Package for stores".
   - Android: last ned pakken. Den gir deg en `.aab`-fil til Play og en
     `assetlinks.json`-fil (se steg 3).
   - iOS: last ned iOS-pakken. Den åpnes i Xcode på Mac.

## Steg 2: Google Play (oppdatere den eksisterende appen)

1. Logg inn på [Play Console](https://play.google.com/console).
2. Åpne appen som allerede ligger der.
3. Last opp den nye `.aab`-filen under "Produksjon" eller "Lukket testing".
   - Viktig: Versjonskoden må være høyere enn forrige. PWABuilder lar deg sette den.
4. Oppdater butikkoppføringen med teksten og skjermbildene lenger ned.
5. Send inn for gjennomgang.

## Steg 3: assetlinks.json (fjerner nettleserlinjen i Android-appen)

Android-appen viser en adresselinje øverst helt til domenet er verifisert. Slik fikser vi det:

1. I Play Console, gå til "Appintegritet" eller "App signing" og kopier
   SHA-256-fingeravtrykket.
2. Lim det inn i `assetlinks.json` fra PWABuilder (eller send det til meg, så lager
   jeg filen ferdig).
3. Filen skal ligge offentlig på `https://lme-contentstudio.pages.dev/.well-known/assetlinks.json`.
   Jeg legger den i repoet når jeg har fingeravtrykket, så publiseres den automatisk.

## Steg 4: App Store (ny innsending)

1. Logg inn på [App Store Connect](https://appstoreconnect.apple.com) og opprett en ny app.
2. Åpne iOS-pakken fra PWABuilder i Xcode på en Mac.
3. Sett app-ikon, navn og versjon, og arkiver (Product, så Archive).
4. Last opp til App Store Connect via Xcode eller Transporter.
5. Fyll inn butikkoppføringen med teksten og skjermbildene under.
6. Send inn for gjennomgang. Apple ser etter at appen føles som en ekte app og ikke
   bare en nettside, så skjermbildene og beskrivelsen bør vise det.

## Butikktekst

### Appnavn
- LME Content Studio

### Kort beskrivelse (norsk)
AI-drevet innholdsstudio for montessori. Lag tekster, bilder og reels på sekunder.

### Kort beskrivelse (engelsk)
AI content studio for Montessori. Create captions, images and reels in seconds.

### Full beskrivelse (norsk)
LME Content Studio hjelper deg å lage vakkert montessori-innhold til sosiale medier,
raskt og enkelt. Skriv inn et tema, så får du ferdige tekster, bilder og reels du kan
publisere rett til Instagram, TikTok og Facebook.

Med i appen:
- Bildetekster og innlegg på norsk og engelsk
- AI-bilder i din egen stil, med Mia og Teo
- Reels og karuseller som er klare til å deles
- Innholdskalender og planlegging
- Automatisk publisering til sosiale medier

Laget for foreldre, pedagoger og små bedrifter som vil dele montessori med verden.

### Full beskrivelse (engelsk)
LME Content Studio helps you create beautiful Montessori content for social media,
quickly and easily. Type a topic and get ready-made captions, images and reels you
can publish straight to Instagram, TikTok and Facebook.

Inside the app:
- Captions and posts in Norwegian and English
- AI images in your own style, featuring Mia and Teo
- Reels and carousels ready to share
- Content calendar and scheduling
- Automatic publishing to social media

Made for parents, educators and small businesses who want to share Montessori with
the world.

### Nøkkelord (App Store)
montessori, innhold, sosiale medier, reels, AI, bildetekst, instagram, pedagog, barn, lek

### Kategori
- Google Play: Utdanning (sekundær: Produktivitet)
- App Store: Education (sekundær: Productivity)

### Aldersgrense
4+ / Alle. Appen er for voksne, men har ikke noe upassende innhold.

### Personvernlenke (kreves)
- `https://lme-contentstudio.pages.dev/personvern`

## Skjermbilder

Begge butikkene krever skjermbilder. Enklest: åpne appen på telefonen og ta vanlige
skjermbilder av de fineste skjermene (forsiden, et ferdig innlegg, et AI-bilde, reel-
flyten, kalenderen).

- Google Play: minst 2 skjermbilder, helst 4 til 8. Telefonformat (portrett).
- App Store: skjermbilder for iPhone 6,7" (1290 x 2796) og gjerne 6,5". PWABuilder og
  App Store Connect viser de eksakte målene.

Hvis du sender meg 4 til 6 skjermbilder, kan jeg sette dem opp i pene rammer med korte
tekster over, slik at oppføringen ser proff ut.

## Rekkefølge jeg anbefaler

1. Bekreft appens URL, så fyller jeg den inn alle steder over.
2. Kjør PWABuilder og last ned begge pakkene.
3. Google Play først (oppdatering, raskest siden kontoen finnes).
4. Hent SHA-256, så ferdigstiller jeg assetlinks.json.
5. App Store når du har tilgang til en Mac.
