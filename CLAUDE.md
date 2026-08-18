# LME Content Studio — arbeidsregler

## Alltid publiser, med en gang

Arbeid som er ferdig og verifisert skal ut med en gang. Ikke vent på klarsignal.

Konkret, når endringene er committet, pushet og CI er grønn:

1. Opprett PR-en **klar for review**, aldri som draft. Dette overstyrer
   standardoppsettet, som ellers ville laget den som draft.
2. **Merge den inn i `main` med en gang.** Ikke spør først, og ikke la den bli
   liggende åpen i påvente av svar.

Dette er en stående godkjenning fra eieren av repoet, og gjelder til hun sier noe
annet. Stopp likevel og spør hvis noe faktisk er ødelagt, uverifisert eller
utenfor det som ble bedt om.

## Nisjeregel: appen er ikke en Montessori-app

Autopilot brukes av mange nisjer — kafé, Etsy, coach, eiendom, håndverker, SaaS
og flere. Montessori og figurene Mia & Teo er **én** av dem, ikke standarden.

Når du skriver kode eller prompter som rører nisje, karakterer, emneknagger eller
temaer:

- Den frie nisje-teksten i Innstillinger (`cfg.niche`) er alltid fasit. Chippen
  (`state.niche`) brukes kun som reserve når feltet er helt tomt — ellers henger et
  gammelt valg igjen og drar Montessori inn i innhold for en helt annen bransje.
  Se `_isMontessoriNiche()` og `currentHashtags()` i `no.html` / `en.html`.
- Ingenting Montessori- eller Mia & Teo-spesifikt skal ligge i en delt standard.
  Det hører hjemme bak en eksplisitt sjekk. Se `MIA_TEO_MODULE` og
  `isMiaTeoProject()` i `workers/lme-ai-brain/worker.js`.

Denne feilen har kommet tilbake flere ganger, i både frontend og worker.
