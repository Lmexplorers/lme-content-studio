# lme-ai-brain (Cloudflare Worker)

Delt AI-Worker for alle LME-apper. Autopilot (Content Studio) snakker med den
via `Nathalie AI`-panelet:

```
https://lme-ai-brain.renateshobby.workers.dev/api/ai
```

Konfigurert i `lme-bot-shell-content-studio.js` (`endpoint`), sendt av
`lme-bot-core.js`.

## Hvorfor ligger denne filen i repoet?

Workeren ble tidligere bare redigert i Cloudflare-dashbordet, så koden lå ikke
i versjonskontroll. Den deployede versjonen var fra 3. mai 2026 — altså fra før
Autopilot ble en fler-nisje-app — og den var fortsatt den viktigste gjenværende
kilden til «Montessori-lekkasjen».

## Rotårsak: Montessori-lekkasje fra Worker-siden

Den deployede workeren la `LME_CORE_IDENTITY` inn i **hver eneste** systemprompt,
uansett nisje og uansett app. Den teksten inneholder blant annet:

- «premium Mia & Teo books, workbooks, Montessori-inspired materials …»
- «soft watercolor aesthetic», «Montessori-inspired»
- de låste Mia & Teo-karakterreglene
- `content`-oppgaven: «Create social/marketing content for Mia & Teo and LME
  products» + «Montessori framing: buy some, make some, find some free»

Autopilot sender riktig nisje i Project Brain (`niche`, `brand`, `voice`,
`charPreset`), men workeren leste den aldri. En bruker med nisje «kafé» eller
«Etsy-selger» fikk derfor Montessori-føringer og Mia & Teo lagt på toppen —
uavhengig av frontend-fiksene i `no.html`.

## Hva som er endret

- Identiteten er delt i `CORE_IDENTITY` (nisjenøytral, alltid med) og
  `MIA_TEO_MODULE` (kun når prosjektet faktisk er Montessori / Mia & Teo).
- `isMiaTeoProject()` speiler `_isMontessoriNiche()` i frontend: den frie
  nisje-teksten er fasit, karaktervalget brukes bare når nisjefeltet er tomt.
  `appId: 'lme-studio'` (bok- og materiellbyggeren) er alltid i Mia & Teo-modus.
- Hver oppgave i `TASK_REGISTRY` har nå nisjenøytral `guidance` pluss valgfri
  `miaTeo`-tilleggstekst som bare legges på i Mia & Teo-modus.
- Merkevarefeltene (brand, niche, voice, audience, characters) løftes ut av
  JSON-dumpen og øverst i systemprompten, så modellen faktisk fester seg på dem.
- Mock-provideren er nisjebevisst i stedet for hardkodet Montessori.
- Svaret inkluderer `miaTeoMode: true|false`, så det er mulig å se hvilken modus
  workeren faktisk brukte.

## App-kunnskap

`APP_KNOWLEDGE['content-studio']` beskriver hva Autopilot faktisk kan: faner,
formater, kalender, publiseringskanaler, Innstillinger, og selve Nathalie-panelet.
Uten denne gjettet hun på spørsmål som «hvordan planlegger jeg en uke her?».

Den vedlikeholdes for hånd. Får appen en ny fane eller kanal, må blokken
oppdateres — ingenting synkroniserer den.

## Nettsøk

Av som standard. Brukeren skrur det på med «Søk på nett» i botpanelet, som
sender `webSearch: true`. Workeren legger da på Anthropics serverside-verktøy
`web_search_20260209` med `max_uses: 5`, følger `pause_turn` i inntil fire hopp,
og henger kildene på svaret.

Merk:
- Søk krever en modell som støtter verktøyet. Standardmodellen er derfor byttet
  fra `claude-sonnet-4-20250514` til `claude-opus-5`. Panelet har ingen
  modellvelger, så standarden er det som faktisk brukes for alle forespørsler.
- Søkefeil kommer tilbake som HTTP 200 med et feilobjekt i stedet for lista,
  ikke som en exception. `collectSources()` hopper over dem.
- `fallbacks: 'default'` er slått på, så en sikkerhetsavvisning rutes videre i
  stedet for å bli en blindvei for brukeren.
- Hvert søk koster. Derfor leser hun normalt fra det lagrede tilbudsfeltet.

## Tilbud og kurs

`Innstillinger → Mine tilbud og kurs` har et nettsted-felt og et fritekstfelt som
lagres per merkevareprofil. Knappen «Hent fra nettsiden min» kjører ett
søkedrevet kall mot dette endepunktet og fyller feltet, som så lagres.

Poenget er at tilbudene hentes én gang og **lagres**, i stedet for å søkes opp
på nytt ved hver forespørsel. Nathalie behandler det lagrede feltet som fasit for
navn og priser, og skal aldri finne på et tilbud som ikke står der.

Endepunkter, CORS, providere og payload-formatet er uendret bortsett fra det nye
valgfrie `webSearch`-feltet — eldre klienter fungerer som før.

## Deploy

Workeren har ingen wrangler-oppsett ennå. Deploy via dashbordet:

1. Cloudflare → Workers & Pages → `lme-ai-brain` → Edit code
2. Lim inn hele `worker.js` fra denne mappen
3. Save and deploy

Secrets som må være satt på workeren (uendret): `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`.

## Røyktest etter deploy

```bash
# Skal svare med miaTeoMode: false og ingen Montessori/Mia & Teo
curl -s https://lme-ai-brain.renateshobby.workers.dev/api/ai \
  -H 'Content-Type: application/json' \
  -d '{"appId":"content-studio","taskType":"content","provider":"mock",
       "projectContext":{"brand":"Kafé Nord","niche":"kafé"},
       "messages":[{"role":"user","content":"Skriv en reel-hook"}]}'

# Skal svare med miaTeoMode: true
curl -s https://lme-ai-brain.renateshobby.workers.dev/api/ai \
  -H 'Content-Type: application/json' \
  -d '{"appId":"content-studio","taskType":"content","provider":"mock",
       "projectContext":{"brand":"LME","niche":"Montessori"},
       "messages":[{"role":"user","content":"Skriv en reel-hook"}]}'
```
