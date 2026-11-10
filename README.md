# Parkest v6.7

## v6.7 — Service Worker sempre attivabile

- Il precaricamento non può più annullare l'installazione completa del Service Worker quando una singola risorsa non è raggiungibile.
- Le risorse dell'App Shell vengono memorizzate indipendentemente.
- Il canale Web Push può quindi attivarsi anche se una risorsa opzionale fallisce.

## v6.6 — Attivazione push verificabile

- Registra e avvia esplicitamente il Service Worker prima della Push API.
- Elimina automaticamente una sottoscrizione legata alla precedente chiave VAPID.
- Applica timeout a ogni passaggio che su iOS poteva rimanere bloccato.
- Salva `RICERCA ATTIVA` soltanto dopo la conferma completa del server.
- Mostra sotto al pulsante il passaggio fallito e conserva l'errore sullo schermo.

## v6.5 — Nuova coppia VAPID coerente

- Sostituita la chiave pubblica VAPID dopo la diagnosi Apple `VapidPkHashMismatch`.
- Dopo il deploy occorre aggiornare i secret VAPID della Edge Function, cancellare le vecchie sottoscrizioni e attivare nuovamente la ricerca sui dispositivi.

## v6.4 — Diagnostica push reale

- L'invocazione della funzione push non viene più eseguita senza controllarne l'esito.
- Gli errori del backend vengono mostrati dopo la pubblicazione del parcheggio.
- La funzione restituisce utenti idonei, tentativi, invii e fallimenti e registra i dettagli nei log Supabase.
- Un test con lo stesso account che pubblica il posto non è valido: il mittente viene escluso intenzionalmente. Per il collaudo servono due account distinti.

## v6.3 — Cache iOS azzerata per nome file

La v6.3 usa nuovi nomi fisici per JavaScript e service worker, evitando che
iOS riutilizzi copie precedenti nonostante il cambio di versione nella query.
La schermata mostra "JavaScript 6.3 attivo" soltanto se il nuovo file viene
eseguito realmente.

## v6.2 — Web Push verificato

La v6.2 conferma la ricerca attiva solo dopo aver riletto dal database la
sottoscrizione Apple appena registrata e applica un inserimento diretto di
ripiego protetto dalle policy RLS.

## v6.1 — Web Push multipiattaforma

La v6.1 trasferisce in modo sicuro la sottoscrizione push quando sullo stesso
dispositivo cambia l'account e conferma la ricerca attiva soltanto dopo una
sincronizzazione server riuscita.

- Sottoscrizione Push API con chiave pubblica VAPID per PWA installate.
- Nuove tabelle Supabase `push_subscriptions` e `search_sessions`, protette da RLS.
- La ricerca attiva salva sul server posizione, raggio e sottoscrizione del dispositivo.
- La funzione Edge `notify-nearby-spot` invia notifiche ai dispositivi degli utenti attivi nel raggio anche quando la pagina non è aperta.
- Il Service Worker gestisce l'evento `push`, richiede suono predefinito, vibrazione e azioni `NAVIGA`/`VAI` quando supportate dal sistema.
- Gli endpoint push scaduti vengono eliminati automaticamente.
- L'indirizzo del parcheggio viene salvato nel record per evitare geocoding tardivo durante l'invio.

### Configurazione v6.0

1. Eseguire `supabase_v600_web_push.sql` nel SQL Editor.
2. Distribuire la funzione `supabase/functions/notify-nearby-spot` con verifica JWT attiva.
3. Impostare nei segreti della funzione `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`.
4. Non inserire mai la chiave privata VAPID nel repository o nel frontend.

## v5.14 — NAVIGA segnala l'arrivo

- Premendo `NAVIGA` su un posto `LIBERO` o programmato, Parkest esegue prima il claim atomico e poi apre il navigatore.
- Il posto passa a `IN_ARRIVO`; gli altri utenti vedono il marker rosso e “Qualcuno sta raggiungendo il posto”.
- `VAI` continua a eseguire il claim senza aprire il navigatore.
- Sul proprio posto già `IN_ARRIVO`, `NAVIGA` apre solamente il percorso senza ripetere il claim.
- Un'eventuale azione `NAVIGA` supportata dalla notifica apre Parkest, esegue il claim e poi avvia il percorso.

## v5.13.2 — recupero password più chiaro

- `INVIA LINK` diventa `INVIA EMAIL DI RECUPERO`.
- `Annulla` diventa `← TORNA AL LOGIN`.
- Aggiunta una spiegazione chiara: la password non cambia finché l'utente non apre il link ricevuto.

## Titolarità

Parkest è stata ideata e creata da Christian Savoia.
Copyright © 2026 Christian Savoia. Tutti i diritti riservati.
Vedere `COPYRIGHT.md` per l'avviso completo.

## v5.13.1 — attribuzione

- Inseriti autore e copyright nei metadati della pagina.
- Inserita l'attribuzione visibile nell'interfaccia.
- Aggiunto `COPYRIGHT.md` al progetto.

## v5.13 — recupero password e testo ricerca

- La ricerca attiva dichiara “Riceverai notifiche sui parcheggi disponibili”.
- La ricerca disattivata invita a cercare parcheggi e ricevere notifiche.
- Nel login compare “Hai dimenticato la password?”; Supabase invia un link all'email dell'account.
- Il link apre Parkest in modalità recupero e consente di scegliere e confermare una nuova password.
- Parkest usa l'email come identificativo di accesso: non esiste uno username separato da recuperare.

## v5.12.2 — ritorno al proprio posto

- Anche l'utente che aveva segnalato un parcheggio può successivamente premere `VAI` sullo stesso posto, se è ancora `LIBERO`.
- Il claim resta atomico: un solo utente può ottenere lo stato `IN_ARRIVO`.
- La ricerca attiva può notificare anche un posto segnalato in precedenza dallo stesso account.
- Eseguire una volta in Supabase SQL Editor: `supabase_v5122_allow_return_to_own_spot.sql`.

## v5.12.1 — testo notifiche più esplicito

- Quando la ricerca è attiva, il pulsante dichiara chiaramente: “Riceverai notifiche per i posti compatibili”.
- Quando è spenta, l'invito specifica “Tocca per cercare e ricevere notifiche”.
- Se manca il permesso del dispositivo, il pulsante indica direttamente di abilitarlo.

## v5.12 — ricerca attiva e notifiche autosufficienti

- Il vecchio comando notifiche diventa un unico interruttore chiaramente leggibile: `RICERCA DISATTIVATA` / `RICERCA ATTIVA`.
- A ricerca spenta Parkest non invia popup né vibrazioni; la scelta viene ricordata sul dispositivo.
- Attivando la ricerca viene richiesto, quando necessario, il permesso per le notifiche.
- Le notifiche dei parcheggi includono indirizzo, distanza e disponibilità.
- Le notifiche PWA espongono `NAVIGA` e `VAI`: entrambe tentano il claim atomico; `NAVIGA` apre anche il percorso.
- La ricerca preventiva con destinazione e il push realmente affidabile ad app terminata richiedono il successivo modulo destinazione/geofencing e un backend Web Push.

## Fix sincronizzazione multiutente

- VAI aggiorna il database a `IN_ARRIVO` con `claimed_by`.
- Gli altri utenti vedono subito il segnalino rosso e il testo **“Qualcuno sta raggiungendo il posto”**.
- Aggiunto un broadcast Realtime come acceleratore UX; Supabase resta la fonte autorevole.
- Aggiunto refresh di sicurezza ogni 3 secondi e al ritorno/focus dell'app.
- Corretto il cache locale `claimedSpotIds` per evitare che un claim di un altro utente venga interpretato come proprio.
- Il posto rosso di un altro utente resta sulla mappa ma non nella lista dei disponibili.
- Chi ha premuto VAI continua a vedere `NAVIGA + SONO ARRIVATO`.

Le patch SQL v5.3/v5.5 restano necessarie se non sono già state applicate.

# Parkest

Parkest è una web app mobile-first per mettere in contatto chi sta lasciando un parcheggio e chi ne sta cercando uno nelle vicinanze.

## Stack

- Frontend statico: HTML, CSS, JavaScript
- Hosting: Vercel
- Repository: GitHub
- Backend/Auth/Realtime: Supabase
- Mappa: Leaflet + OpenStreetMap
- Reverse geocoding: OpenStreetMap Nominatim

## Regola architetturale del modulo CERCO

**Supabase è l'unica sorgente dati.** Dal dataset canonico dei posti nel raggio vengono derivate due viste coerenti: la mappa e la lista. La mappa può mostrare anche un posto rosso `IN_ARRIVO` reclamato da un altro utente come informazione contestuale; la lista dei posti utilizzabili invece lo esclude.

Realtime è il meccanismo principale di sincronizzazione. Un polling leggero ogni ~12 secondi è solo una rete di sicurezza e ridisegna l'interfaccia esclusivamente quando i dati del database sono realmente cambiati.

## Stati e azioni

- 🟠 `LIBERO` + `available_at > now`: **“Si libera tra X min”**. `NAVIGA` disponibile, `VAI` non disponibile.
- 🟢 `LIBERO` + `available_at <= now`: **“Libero adesso”**. `VAI` comunica a Parkest che l'utente sta andando verso il posto; `NAVIGA` apre solamente il navigatore.
- 🔴 `IN_ARRIVO` proprio: **“Stai raggiungendo questo posto”**, con `NAVIGA` + `SONO ARRIVATO`.
- 🔴 `IN_ARRIVO` di un altro utente: resta visibile sulla mappa con la sola frase **“Qualcuno sta raggiungendo il posto”**. Nessuna azione e nessuna scheda nella lista dei posti disponibili.
- `OCCUPATO`: invisibile.

### Regola VAI / NAVIGA

**VAI e NAVIGA comunicano entrambe l'intenzione di raggiungere il posto.**

- `VAI` modifica lo stato condiviso di Parkest tramite `claim_parking_spot`, portando il posto a `IN_ARRIVO`. **Non apre il navigatore.**
- `NAVIGA` porta prima il posto a `IN_ARRIVO` e, soltanto se il claim riesce, apre il navigatore.

Parkest non prenota né garantisce un parcheggio pubblico: `VAI` indica soltanto agli altri utenti che qualcuno lo sta raggiungendo.

## Mappa ↔ Lista

- Marker arancioni, verdi e rossi propri hanno la relativa scheda in lista.
- Click/tap sul marker con scheda → seleziona e porta alla stessa scheda nella lista e apre il popup.
- Click/tap sulla scheda → centra la mappa sul marker e apre il popup.
- Un marker rosso di un altro utente apre solo il popup informativo e non tenta di selezionare una scheda inesistente.
- La lista non contiene duplicati, `OCCUPATO`, posti fuori raggio o `IN_ARRIVO` di altri utenti.

## Flusso core

1. Utente A sceglie LASCIO.
2. Seleziona Adesso oppure 5/15/20/30/45/+45 minuti.
3. Parkest salva posizione, `status=LIBERO`, `available_at` e `released_by`.
4. Utente B riceve il posto via Realtime.
5. Se programmato: arancione + countdown + NAVIGA.
6. A scadenza: verde + VAI + NAVIGA.
7. Se B preme VAI, la RPC atomica `claim_parking_spot` imposta `IN_ARRIVO`; il navigatore non viene aperto automaticamente.
8. Agli altri utenti il posto resta rosso sulla mappa con “Qualcuno sta raggiungendo il posto”, ma scompare dalla lista disponibile.
9. Per B resta rosso con NAVIGA + SONO ARRIVATO.
10. SONO ARRIVATO usa `occupy_parking_spot` e rimuove il posto.

## GPS intelligente all'arrivo

Dopo VAI, Parkest osserva la posizione. Se l'utente è entro circa 25 m, quasi fermo e rimane così per ~75 secondi, propone: “Sembra che tu abbia parcheggiato qui. Confermi?”. Se si allontana, il timer si azzera. SONO ARRIVATO resta sempre disponibile manualmente.

## Notifiche

- 🔔 nuovo posto libero nel raggio.
- 🔔 posto programmato quando entra nella soglia dei 10 minuti.
- 🔔 quando un posto programmato diventa libero.
- 📳/buzzer quando un posto visto dall'utente viene preso da qualcun altro.
- Evitare duplicati/spam.

Per notifiche affidabili con app/browser chiuso serviranno Web Push + Service Worker o push nativo.

## Roadmap

Dopo la stabilizzazione del core: PWA installabile e test sul campo, poi packaging iOS/Android e beta cittadina. Successivamente: destinazioni preferite, storico/predizione disponibilità, impatto ambientale, veicoli/promemoria, segnalazioni stradali e attività commerciali sponsorizzate.

## Sicurezza Supabase

Gli utenti devono essere autenticati. Il client usa esclusivamente la publishable/anon key, mai `service_role`. Il claim e la chiusura del parcheggio avvengono tramite RPC database con controllo su `auth.uid()`.

## Build

**v5.1 — semantica VAI / NAVIGA:** VAI aggiorna Parkest senza aprire il navigatore; NAVIGA apre soltanto la navigazione; i posti `IN_ARRIVO` di altri utenti restano rossi sulla mappa come informazione ma sono esclusi dalla lista disponibile.


## Parkest v5.2 – correzione VAI / SONO ARRIVATO

- Un parcheggio verde libero mostrato a un altro utente offre **NAVIGA** e **VAI** sia nella lista sia nel popup.
- **NAVIGA** apre esclusivamente il navigatore e non cambia lo stato del parcheggio.
- **VAI** invia esclusivamente a Parkest lo stato `IN_ARRIVO`; non apre il navigatore.
- Dopo VAI, per l'utente che lo ha premuto il posto resta nella lista come rosso con **NAVIGA** + **SONO ARRIVATO**.
- Per gli altri utenti il rosso resta solo sulla mappa con “Qualcuno sta raggiungendo il posto”, senza azioni e fuori dalla lista dei disponibili.
- **SONO ARRIVATO** porta il record a `OCCUPATO`, lo rimuove subito da mappa/lista e forza un riallineamento con Supabase.
- È stato aggiunto un tracciamento locale del claim per evitare che latenze Realtime/poll facciano sparire temporaneamente **SONO ARRIVATO**.
- `app.js` e `styles.css` sono versionati nella pagina (`?v=5.2`) per evitare cache del browser dopo il deploy.


## v5.3 — VAI anche sui parcheggi programmati
- Un posto `LIBERO` con `available_at` nel futuro mostra **NAVIGA + VAI** agli altri utenti.
- **NAVIGA** apre soltanto il navigatore e non cambia lo stato Parkest.
- **VAI** segnala immediatamente che l'utente sta raggiungendo il posto, anche se il posto si libererà tra alcuni minuti.
- Dopo **VAI**, il posto passa a `IN_ARRIVO`; agli altri appare sulla mappa come **“Qualcuno sta raggiungendo il posto”** e non compare nella lista dei disponibili.
- Per chi ha premuto VAI restano **NAVIGA + SONO ARRIVATO**.


## Identità v5.4
- Motto: **Il tuo tempo e l'ambiente contano.**
- Pulsante Indietro reso più evidente e user-friendly.


## v5.5
- `VAI` is shown for every LIBERO spot, both immediate and scheduled.
- `NAVIGA` remains independent and only opens navigation.
- Pressing `VAI` changes the shared state to `IN_ARRIVO`; other users see the red marker with “Qualcuno sta raggiungendo il posto”.
- `SONO ARRIVATO` removes the spot from the available map/list flow.


## v5.6 — verifica azioni core
- Ogni parcheggio `LIBERO`, sia immediato sia programmato, mostra sempre **NAVIGA + VAI**.
- **NAVIGA** apre soltanto il navigatore e non cambia lo stato Parkest.
- **VAI** porta il posto a `IN_ARRIVO` e lo rende rosso per gli altri utenti.
- Per l’utente che ha premuto **VAI**, il posto resta nella lista con **NAVIGA + SONO ARRIVATO**.
- **SONO ARRIVATO** porta il posto a `OCCUPATO` e lo rimuove da mappa e lista.
- Rimossa una vecchia guardia frontend che impediva `VAI` sui posti pubblicati dallo stesso account, così frontend e RPC Supabase v5.5 sono coerenti.

## v5.8 — clustering + tipo parcheggio
- I parcheggi `LIBERO` e programmati vengono raggruppati sulla mappa quando sono molto vicini: il cluster mostra il numero di posti disponibili e si apre con zoom/tocco.
- I marker rossi `IN_ARRIVO` restano fuori dal conteggio dei disponibili, così il numero del cluster non è falsato.
- In **LASCIO** si sceglie il tipo: `Libero`, `Disco orario`, `A pagamento`, `Disabili`.
- Il tipo compare sia nella lista sia nel popup della mappa.
- Prima di usare questa versione eseguire in Supabase SQL Editor: `supabase_v58_parking_type.sql`.

## v5.10 — PWA installabile

Parkest è ora configurata come Progressive Web App (PWA):
- `manifest.webmanifest` definisce nome, icone, colori e modalità `standalone`;
- `sw.js` registra il service worker e mantiene in cache l'App Shell locale;
- sono incluse icone 192×192, 512×512, maskable 512×512 e Apple Touch Icon;
- dalle Impostazioni compare **INSTALLA PARKEST** quando il browser supporta il prompt;
- su iPhone/iPad viene mostrata l'istruzione **Safari → Condividi → Aggiungi alla schermata Home**.

La PWA non rende offline le funzioni Realtime/GPS/mappe: Supabase e i servizi di mappa richiedono comunque una connessione di rete. L'obiettivo della v5.10 è dare a Parkest un'esperienza installabile da schermata Home per i primi test sul campo.


## v5.10 — Home live + raggio
- Il riquadro “Posti disponibili” della home usa dati Supabase aggiornati in tempo reale.
- I posti `IN_ARRIVO` e `OCCUPATO` non vengono contati come disponibili.
- Raggio selezionabile dalla home: 300 m, 500 m, 1 km, 2 km, 5 km.
- Il raggio scelto viene mantenuto e passato anche alla schermata CERCO.
- Realtime + polling di sicurezza ogni 5 secondi quando la home è visibile.


## v5.11.1 — Branding Parkest
- Inserito il logo Parkest selezionato nella home e nella schermata di accesso.
- Il logo sostituisce la vecchia P generica anche nella barra superiore.
- Aggiornate le icone PWA 192, 512, maskable e Apple Touch Icon.
- Nessuna modifica richiesta a Supabase.
