/* Beschikbaarheid van Maison l'Amitié — Vercel-functie op /api/beschikbaarheid
   ===========================================================================
   Leest de persoonlijke Google Agenda van de eigenaar en geeft ALLEEN data
   terug, nooit titels, namen of andere afspraken. De kleur van een
   evenement beslist:
     Pistache (groen)  = bevestigde reservering  -> 'bezet'
     Banaan  (geel)    = optie, nog niet bevestigd -> 'optie'
     elke andere kleur = persoonlijk, wordt genegeerd
   Een evenement zonder eigen kleur (de standaardkleur van de agenda) telt
   dus ook niet mee: kies de kleur echt bij het evenement zelf.

   Eenmalig instellen (de agenda blijft privé, niets wordt openbaar):
     1. console.cloud.google.com, in het project waar de Calendar API al aan
        staat: IAM en beheer > Serviceaccounts > Serviceaccount maken
        (bv. 'kalender'). Rollen zijn niet nodig.
        Open het account > Sleutels > Sleutel toevoegen > JSON. Er wordt een
        bestand gedownload: bewaar het veilig, nooit in deze map/GitHub.
     2. De eigenaar opent in Google Agenda de instellingen van haar agenda >
        'Delen met specifieke personen' > voegt het e-mailadres van het
        serviceaccount toe (staat in het JSON-bestand bij "client_email",
        eindigt op .iam.gserviceaccount.com) met 'Alle details van
        afspraken bekijken'.
     3. Vercel > project > Settings > Environment Variables:
          GOOGLE_CLIENT_EMAIL  = "client_email" uit het JSON-bestand
          GOOGLE_PRIVATE_KEY   = "private_key" uit het JSON-bestand (volledig,
                                 van -----BEGIN tot END PRIVATE KEY-----)
          KALENDER_ID          = het Gmail-adres van de eigenaar (hoofdagenda)
                                 of de Agenda-ID van een aparte agenda
        Daarna opnieuw deployen.
     Optioneel, als een kleur toch een ander nummer blijkt te hebben:
          KLEUR_BEVESTIGD (standaard 2) en KLEUR_OPTIE (standaard 5).
        Google nummert de 11 evenementkleuren van 1 t/m 11; Banaan is 5. */

'use strict';

const crypto = require('crypto');

const KLEUR_BEVESTIGD = (process.env.KLEUR_BEVESTIGD || '2').split(',').map(s => s.trim());
const KLEUR_OPTIE = (process.env.KLEUR_OPTIE || '5').split(',').map(s => s.trim());
const MAANDEN_VOORUIT = 13;
const TIJDZONE = 'Europe/Brussels';

// Fout met alleen niet-geheime info: welke stap, Google-status en korte reden
function fout(stap, status, tekst) {
  let reden = '';
  try {
    const j = JSON.parse(tekst);
    reden = j.error_description || j.error && (j.error.errors && j.error.errors[0] && j.error.errors[0].reason || j.error.status || j.error) || '';
  } catch (e) { /* geen JSON */ }
  const f = new Error(stap + ' ' + status + ' ' + tekst);
  f.info = { stap, status, reden: String(reden).slice(0, 120) };
  return f;
}

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Toegangstoken voor het serviceaccount (JWT ondertekend met de privésleutel)
async function haalToken(email, sleutel) {
  const nu = Math.floor(Date.now() / 1000);
  const kop = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhoud = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nu,
    exp: nu + 3600
  }));
  let ruw;
  try {
    ruw = crypto.createSign('RSA-SHA256').update(kop + '.' + inhoud).sign(sleutel, 'base64');
  } catch (e) {
    // alleen de vorm van de waarde melden, nooit de inhoud
    const ruwe = process.env.GOOGLE_PRIVATE_KEY || '';
    const vorm = 'lengte ' + ruwe.length +
      ', BEGIN ' + (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(ruwe) ? 'ja' : 'nee') +
      ', END ' + (/-----END [A-Z ]*PRIVATE KEY-----/.test(ruwe) ? 'ja' : 'nee');
    throw fout('sleutel', 0, JSON.stringify({ error: 'GOOGLE_PRIVATE_KEY is geen geldige privésleutel (' + vorm + ')' }));
  }
  const handtekening = ruw
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: kop + '.' + inhoud + '.' + handtekening
    })
  });
  if (!r.ok) throw fout('inloggen', r.status, await r.text());
  return (await r.json()).access_token;
}

async function haalEvenementen(token, kalenderId, van, tot) {
  const items = [];
  let pagina = '';
  do {
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(kalenderId) + '/events?' + new URLSearchParams({
        timeMin: van.toISOString(),
        timeMax: tot.toISOString(),
        singleEvents: 'true',
        maxResults: '2500',
        fields: 'accessRole,nextPageToken,items(start,end,colorId,status)',
        ...(pagina ? { pageToken: pagina } : {})
      });
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw fout('agenda', r.status, await r.text());
    const data = await r.json();
    items.toegang = data.accessRole;
    items.push(...(data.items || []));
    pagina = data.nextPageToken || '';
  } while (pagina);
  return items;
}

// 'JJJJ-MM-DD' van een tijdstip, in Belgische tijd
function datumBrussel(tijdstip) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIJDZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(tijdstip));
}
function plusDag(datum) {
  const d = new Date(datum + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* Een evenement -> de bezette nachten { van, tot }, tot exclusief
   (= vertrekdag, die blijft vrij als aankomstdag).
     hele dag(en): van startdatum tot einddatum (Google: einde exclusief)
     met uren:     van de dag van aankomst tot de dag van vertrek; valt alles
                   op één dag, dan telt die ene nacht. */
function nachten(ev) {
  if (ev.start.date && ev.end && ev.end.date) {
    return { van: ev.start.date, tot: ev.end.date };
  }
  if (ev.start.dateTime && ev.end && ev.end.dateTime) {
    const van = datumBrussel(ev.start.dateTime);
    let tot = datumBrussel(ev.end.dateTime);
    if (tot <= van) tot = plusDag(van);
    return { van, tot };
  }
  return null;
}

function verdeel(items) {
  const bezet = [], optie = [];
  for (const ev of items) {
    if (!ev || ev.status === 'cancelled' || !ev.start) continue;
    const kleur = ev.colorId ? String(ev.colorId) : '';
    const lijst = KLEUR_BEVESTIGD.includes(kleur) ? bezet
      : KLEUR_OPTIE.includes(kleur) ? optie : null;
    if (!lijst) continue;
    const n = nachten(ev);
    if (n) lijst.push(n);
  }
  return { bezet, optie };
}

/* De sleutel netjes opbouwen, hoe hij ook in Vercel geplakt is: met of
   zonder aanhalingstekens, met \n-tekens, echte regeleinden, spaties of
   alles op één regel. Alleen de code tussen BEGIN en END telt. */
function herstelSleutel(ruw) {
  const tekst = ruw.replace(/\\n/g, '\n');
  const m = tekst.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!m) {
    // zonder BEGIN/END-regels geplakt: alleen de code zelf; die aanvullen
    const code = tekst.replace(/^\s*"+|"+,?\s*$/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
    if (code.length < 500) return tekst.trim();
    return '-----BEGIN PRIVATE KEY-----\n' + code.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n';
  }
  const code = m[2].replace(/\\r|[^A-Za-z0-9+/=]/g, '');
  return '-----BEGIN ' + m[1] + '-----\n' + code.match(/.{1,64}/g).join('\n') +
    '\n-----END ' + m[1] + '-----\n';
}

module.exports = async function handler(req, res) {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const sleutel = herstelSleutel(process.env.GOOGLE_PRIVATE_KEY || '');
  const kalenderId = process.env.KALENDER_ID;

  if (!email || !sleutel || !kalenderId) {
    // alleen de NAMEN van ontbrekende instellingen, nooit waarden
    const ontbreekt = [];
    if (!email) ontbreekt.push('GOOGLE_CLIENT_EMAIL');
    if (!sleutel) ontbreekt.push('GOOGLE_PRIVATE_KEY');
    if (!kalenderId) ontbreekt.push('KALENDER_ID');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ fout: 'niet ingesteld', ontbreekt });
  }

  try {
    const van = new Date();
    van.setUTCDate(van.getUTCDate() - 1);
    const tot = new Date(van);
    tot.setUTCMonth(tot.getUTCMonth() + MAANDEN_VOORUIT);

    const token = await haalToken(email, sleutel);
    const items = await haalEvenementen(token, kalenderId, van, tot);

    const antwoord = verdeel(items);
    // ?controle: toegangsniveau en aantallen per kleurnummer (geen titels of data)
    if (req.query && 'controle' in req.query) {
      const kleuren = {};
      for (const ev of items) {
        const k = ev.colorId || 'geen';
        kleuren[k] = (kleuren[k] || 0) + 1;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(Object.assign({ toegang: items.toegang, gelezen: items.length, kleuren }, antwoord));
    }
    // 5 minuten bewaren op Vercel, zodat Google niet bij elk bezoek gevraagd wordt
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(antwoord);
  } catch (e) {
    console.error('beschikbaarheid:', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json(Object.assign({ fout: 'agenda niet bereikbaar' }, e.info || {}));
  }
};

module.exports.verdeel = verdeel;  // voor tests
