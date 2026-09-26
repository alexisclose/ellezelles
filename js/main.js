/* Vakantiewoning [Naam] — homepage-interacties
   Geen frameworks, geen build-stap. */

(function () {
  'use strict';

  /* ---- 1. Header wordt wit zodra je voorbij de hero scrolt ---- */
  var header = document.getElementById('header');
  function onScroll() {
    header.classList.toggle('is-stuck', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- 2. Mobiel menu ---- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---- 3. Carousels (Ons huis + Aanbiedingen) ----
     De carousel zelf is pure CSS (scroll-snap), dus swipen op mobiel werkt
     zonder JavaScript. Dit stukje bedient alleen de pijltjes op desktop en
     verbergt ze zodra er niets te scrollen valt. */
  document.querySelectorAll('[data-carousel]').forEach(function (track) {
    var section = track.closest('section');
    var nav = section ? section.querySelector('.slider__nav') : null;
    var buttons = nav ? Array.prototype.slice.call(nav.querySelectorAll('.slider__btn')) : [];

    function step() {
      var first = track.firstElementChild;
      if (!first) return track.clientWidth;
      return first.getBoundingClientRect().width +
             parseFloat(getComputedStyle(track).gap || 0);
    }
    function maxScroll() {
      return track.scrollWidth - track.clientWidth;
    }
    function sync() {
      var scrollable = maxScroll() > 1;
      if (nav) nav.style.visibility = scrollable ? 'visible' : 'hidden';
      buttons.forEach(function (b) {
        var dir = Number(b.dataset.dir);
        b.disabled = dir < 0
          ? track.scrollLeft <= 1
          : track.scrollLeft >= maxScroll() - 1;
      });
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        track.scrollBy({ left: Number(b.dataset.dir) * step(), behavior: 'smooth' });
      });
    });

    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });

  /* ---- 4. Secties laten opkomen bij het scrollen ---- */
  /* Let op: kaarten binnen een carousel krijgen geen reveal — die staan
     horizontaal buiten beeld en zouden dan leeg blijven tot je swipet. */
  var targets = document.querySelectorAll(
    '.section > .container, .cta__grid, .grid-4 > .card'
  );
  targets.forEach(function (el) { el.setAttribute('data-reveal', ''); });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---- 5. Aanvraag- en contactformulier ----
     Verstuurt naar Netlify Forms (zie de uitleg in contact.html) zonder
     de pagina te verlaten. Netlify mailt het bericht door naar de eigenaar,
     met het hier samengestelde onderwerp. */
  var contactform = document.getElementById('contactform');
  if (contactform) {
    var melding = document.getElementById('formmelding');
    var verstuurknop = document.getElementById('verstuurknop');
    var toonMelding = function (tekst) {
      melding.textContent = tekst;
      melding.classList.add('is-zichtbaar');
    };
    var mooi = function (waarde) {  // '2026-10-03' -> 'za 3 okt 2026'
      return new Date(waarde + 'T00:00').toLocaleDateString('nl-BE',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    contactform.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!contactform.checkValidity()) {
        contactform.reportValidity();
        return;
      }

      var f = contactform.elements;
      var wie = f.voornaam.value + ' ' + f.naam.value;
      var aanvraag = f.aankomst.value && f.vertrek.value;
      f.subject.value = aanvraag
        ? 'Aanvraag verblijf ' + mooi(f.aankomst.value) + ' – ' + mooi(f.vertrek.value) +
          ' (' + f.nachten.value + ' n.) — ' + wie
        : 'Vraag via de website — ' + wie;

      verstuurknop.disabled = true;
      toonMelding('Bezig met versturen…');
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(contactform)).toString()
      })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          contactform.reset();
          toonMelding(aanvraag
            ? 'Bedankt! Uw aanvraag is verstuurd. U krijgt zo snel mogelijk een antwoord per e-mail. ' +
              'Let op: uw verblijf is pas vast na onze bevestiging.'
            : 'Bedankt! Uw bericht is verstuurd. U krijgt zo snel mogelijk een antwoord per e-mail.');
        })
        .catch(function () {
          toonMelding('Het versturen is niet gelukt. Probeer het later opnieuw, ' +
            'of mail ons rechtstreeks via het adres hierboven.');
        })
        .then(function () { verstuurknop.disabled = false; });
    });
  }

  /* ---- 6. Beschikbaarheidskalender (contactpagina) ----
     De bezette dagen komen uit een openbare Google Agenda. Eenmalig instellen:
       1. Maak in Google Agenda een aparte agenda 'Vakantiewoning – bezetting'.
       2. Instellingen van die agenda > Toegangsrechten: 'Openbaar maken' met
          'Alleen beschikbaarheid weergeven (details verbergen)'. Zo zijn
          namen van gasten nooit zichtbaar.
       3. Instellingen > Agenda integreren: kopieer de 'Agenda-ID' naar
          KALENDER_ID hieronder.
       4. console.cloud.google.com: maak een project, zet de 'Google Calendar
          API' aan en maak een API-sleutel. Beperk die sleutel tot die API en
          tot het domein van de site (plus localhost om te testen). Zet hem
          in API_SLEUTEL.
     Een evenement over de hele dag = bezette nachten. De einddatum van een
     Google-evenement is exclusief, dus de vertrekdag blijft vrij als
     aankomstdag voor de volgende gast.
     Gasten kunnen in de kalender een periode kiezen; die komt dan in het
     aanvraagformulier terecht (blok 5 verstuurt het).
     Testen met voorbeelddata: contact.html?demo#beschikbaarheid */
  var KALENDER_ID = '0bd0051528690141163417424b4dbadb28cd04c4e81ae253a1d54d7367d19a77@group.calendar.google.com';
  var API_SLEUTEL = 'AIzaSyBerFelafUnLEY4gSKVvVKJcROyyHVw0Bs';
  var MAANDEN_VOORUIT = 12;

  var kalender = document.getElementById('kalender');
  if (kalender) {
    var maandenEl = document.getElementById('kalendermaanden');
    var kalMelding = document.getElementById('kalendermelding');
    var pijlen = kalender.querySelectorAll('.kalender__pijl');
    var bezet = {};          // { 'JJJJ-MM-DD': true }
    var verschuiving = 0;    // aantal maanden vooruit gebladerd
    var breed = window.matchMedia('(min-width: 760px)');

    var vandaag = new Date();
    vandaag = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate());

    function sleutel(d) {
      return d.getFullYear() + '-' +
        ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
        ('0' + d.getDate()).slice(-2);
    }
    function leesDatum(tekst) {  // 'JJJJ-MM-DD' als lokale datum
      var p = tekst.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    function markeer(van, tot) {  // tot is exclusief
      for (var d = new Date(van); d < tot; d.setDate(d.getDate() + 1)) {
        bezet[sleutel(d)] = true;
      }
    }
    function verwerk(items) {
      items.forEach(function (ev) {
        if (!ev.start || !ev.end) return;
        if (ev.start.date) {
          markeer(leesDatum(ev.start.date), leesDatum(ev.end.date));
        } else {
          // evenement met uren: elke dag die het raakt telt als bezet
          var van = new Date(ev.start.dateTime);
          van = new Date(van.getFullYear(), van.getMonth(), van.getDate());
          markeer(van, new Date(ev.end.dateTime));
        }
      });
    }

    /* Keuze van de gast, zoals bij Airbnb: eerst aankomst, dan vertrek.
       Een nacht is vrij als die dag niet bezet is; de vertrekdag zelf mag
       dus wel bezet zijn (dan komt er die dag een nieuwe gast aan). */
    var keuze = { aankomst: null, vertrek: null };
    var geladen = false;
    var keuzetekst = document.getElementById('keuzetekst');
    var keuzewis = document.getElementById('keuzewis');
    var keuzeaanvraag = document.getElementById('keuzeaanvraag');
    var aankomstIn = document.getElementById('aankomst');
    var vertrekIn = document.getElementById('vertrek');
    var onderwerpIn = document.getElementById('onderwerp');
    var nachtenIn = document.getElementById('nachten');
    var autoOnderwerp = '';

    function volgendeDag(d) { var x = new Date(d); x.setDate(x.getDate() + 1); return x; }
    function nachtVrij(d) { return d >= vandaag && !bezet[sleutel(d)]; }
    function periodeVrij(van, tot) {
      for (var d = new Date(van); d < tot; d = volgendeDag(d)) {
        if (!nachtVrij(d)) return false;
      }
      return true;
    }
    function kiesbaar(d) {
      if (keuze.aankomst && !keuze.vertrek && d > keuze.aankomst) {
        return periodeVrij(keuze.aankomst, d);
      }
      return nachtVrij(d);
    }
    function aantalNachten(a, v) { return Math.round((v - a) / 864e5); }
    function kort(d) {
      return d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function kies(d) {
      if (keuze.aankomst && !keuze.vertrek && d > keuze.aankomst) {
        keuze.vertrek = d;
      } else {
        keuze.aankomst = d;
        keuze.vertrek = null;
      }
      naKeuze(true);
    }

    // controle van de data in het formulier (ook als ze met de hand ingevuld zijn)
    function controleer() {
      if (!aankomstIn || !vertrekIn) return;
      var a = aankomstIn.value ? leesDatum(aankomstIn.value) : null;
      var v = vertrekIn.value ? leesDatum(vertrekIn.value) : null;
      var fout = '';
      if (a || v) {
        if (!a || !v) fout = 'Vul zowel een aankomst- als een vertrekdag in.';
        else if (a < vandaag) fout = 'De aankomstdag ligt in het verleden.';
        else if (v <= a) fout = 'De vertrekdag moet na de aankomstdag liggen.';
        else if (geladen && !periodeVrij(a, v)) fout = 'Deze periode is (deels) al bezet. Kies andere data in de kalender.';
      }
      vertrekIn.setCustomValidity(fout);
    }

    function naKeuze(vanKalender) {
      var a = keuze.aankomst, v = keuze.vertrek;
      if (geladen) teken();

      if (a && v) {
        var n = aantalNachten(a, v);
        keuzetekst.innerHTML = '<strong>' + kort(a) + ' &rarr; ' + kort(v) + '</strong> &middot; ' +
          n + (n === 1 ? ' nacht' : ' nachten');
      } else if (a) {
        keuzetekst.innerHTML = 'Aankomst <strong>' + kort(a) + '</strong> &mdash; kies nu uw vertrekdag.';
      } else {
        keuzetekst.textContent = 'Klik op uw aankomstdag en daarna op uw vertrekdag.';
      }
      keuzewis.hidden = !a;
      keuzeaanvraag.disabled = !(a && v);

      if (!aankomstIn) return;
      if (vanKalender) {
        aankomstIn.value = a ? sleutel(a) : '';
        vertrekIn.value = v ? sleutel(v) : '';
      }
      nachtenIn.value = a && v ? aantalNachten(a, v) : '';
      // onderwerp alleen invullen zolang de gast er zelf niets anders in zette
      if (onderwerpIn.value === '' || onderwerpIn.value === autoOnderwerp) {
        autoOnderwerp = a && v ? 'Aanvraag verblijf ' + kort(a) + ' – ' + kort(v) : '';
        onderwerpIn.value = autoOnderwerp;
      }
      controleer();
    }

    function vanFormulier() {
      var a = aankomstIn.value ? leesDatum(aankomstIn.value) : null;
      var v = vertrekIn.value ? leesDatum(vertrekIn.value) : null;
      keuze.aankomst = a;
      keuze.vertrek = a && v && v > a ? v : null;
      if (a) {  // blader naar de maand van aankomst
        verschuiving = (a.getFullYear() - vandaag.getFullYear()) * 12 + a.getMonth() - vandaag.getMonth();
      }
      naKeuze(false);
    }

    function aantalZichtbaar() { return breed.matches ? 2 : 1; }

    function tekenMaand(jaar, maand) {
      var eerste = new Date(jaar, maand, 1);
      var titel = eerste.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' });
      var html = '<div class="kalender__maand"><h3 class="kalender__titel">' + titel + '</h3>' +
        '<table class="kalender__tabel"><thead><tr>';
      ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].forEach(function (dag) {
        html += '<th scope="col">' + dag + '</th>';
      });
      html += '</tr></thead><tbody><tr>';

      var leeg = (eerste.getDay() + 6) % 7;  // maandag = 0
      for (var i = 0; i < leeg; i++) html += '<td></td>';

      var dagen = new Date(jaar, maand + 1, 0).getDate();
      for (var n = 1; n <= dagen; n++) {
        var d = new Date(jaar, maand, n);
        var s = sleutel(d);
        var voorbij = d < vandaag;
        var isBezet = !voorbij && bezet[s];
        var klikbaar = kiesbaar(d);
        var klassen = [voorbij ? 'is-voorbij' : (isBezet ? 'is-bezet' : 'is-vrij')];
        var rol = '';
        if (keuze.aankomst && s === sleutel(keuze.aankomst)) { klassen.push('is-aankomst'); rol = ' — aankomst'; }
        if (keuze.vertrek && s === sleutel(keuze.vertrek)) { klassen.push('is-vertrek'); rol = ' — vertrek'; }
        if (keuze.vertrek && d > keuze.aankomst && d < keuze.vertrek) klassen.push('is-binnen');
        if (!voorbij && !isBezet && !klikbaar) klassen.push('is-uit');
        var label = d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' }) +
          (voorbij ? '' : (isBezet ? ' — bezet' : ' — vrij')) + rol;

        if ((leeg + n - 1) % 7 === 0 && n > 1) html += '</tr><tr>';
        html += '<td class="' + klassen.join(' ') + '">' + (klikbaar
          ? '<button type="button" data-datum="' + s + '" aria-label="' + label +
            '" aria-pressed="' + (rol ? 'true' : 'false') + '">' + n + '</button>'
          : '<span aria-label="' + label + '">' + n + '</span>') + '</td>';
      }
      var rest = (7 - (leeg + dagen) % 7) % 7;
      for (var j = 0; j < rest; j++) html += '<td></td>';
      return html + '</tr></tbody></table></div>';
    }

    function teken() {
      var zichtbaar = aantalZichtbaar();
      var max = MAANDEN_VOORUIT - zichtbaar;
      verschuiving = Math.max(0, Math.min(verschuiving, max));
      var html = '';
      for (var k = 0; k < zichtbaar; k++) {
        html += tekenMaand(vandaag.getFullYear(), vandaag.getMonth() + verschuiving + k);
      }
      maandenEl.innerHTML = html;
      pijlen[0].disabled = verschuiving <= 0;
      pijlen[1].disabled = verschuiving >= max;
    }

    // Komt de bezoeker via een 'Reserveren'-knop (contact.html#beschikbaarheid)?
    // De kalender wordt pas na het laden opgebouwd, dus de sprong van de
    // browser zelf mislukt soms; daarom scrollen we er hier nog eens heen.
    function naarKalender() {
      if (location.hash === '#beschikbaarheid') {
        document.getElementById('beschikbaarheid').scrollIntoView({ behavior: 'instant' });
      }
    }

    function toonFout() {
      kalender.classList.add('is-fout');
      kalMelding.innerHTML = 'De beschikbaarheid kon niet geladen worden. ' +
        '<a href="#contactform">Contacteer ons</a> en we laten het u meteen weten.';
      naarKalender();
    }
    function klaar(items) {
      verwerk(items);
      geladen = true;
      kalMelding.textContent = '';
      kalender.classList.add('is-geladen');
      teken();
      controleer();
      naarKalender();
    }

    Array.prototype.forEach.call(pijlen, function (b) {
      b.addEventListener('click', function () {
        verschuiving += Number(b.dataset.stap) * aantalZichtbaar();
        teken();
      });
    });
    breed.addListener(function () { if (geladen) teken(); });

    maandenEl.addEventListener('click', function (e) {
      var knop = e.target.closest('button[data-datum]');
      if (!knop) return;
      var s = knop.dataset.datum;
      kies(leesDatum(s));
      // na het hertekenen de focus terugzetten op dezelfde dag
      var terug = maandenEl.querySelector('button[data-datum="' + s + '"]');
      if (terug) terug.focus();
    });
    keuzewis.addEventListener('click', function () {
      keuze.aankomst = keuze.vertrek = null;
      naKeuze(true);
    });
    keuzeaanvraag.addEventListener('click', function () {
      var form = document.getElementById('contactform');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('voornaam').focus({ preventScroll: true });
    });

    if (aankomstIn) {
      aankomstIn.min = vertrekIn.min = sleutel(vandaag);
      aankomstIn.addEventListener('change', vanFormulier);
      vertrekIn.addEventListener('change', vanFormulier);
      // na versturen wordt het formulier leeggemaakt; kalender mee leegmaken
      aankomstIn.form.addEventListener('reset', function () {
        keuze.aankomst = keuze.vertrek = null;
        autoOnderwerp = '';
        setTimeout(function () { naKeuze(false); }, 0);
      });
    }

    if (/[?&]demo\b/.test(location.search)) {
      // voorbeeldboekingen om lokaal te testen (de API-sleutel werkt
      // alleen op ellezelles.netlify.app)
      var dag = function (plus) {
        var d = new Date(vandaag); d.setDate(d.getDate() + plus); return sleutel(d);
      };
      klaar([
        { start: { date: dag(3) },  end: { date: dag(6) } },
        { start: { date: dag(12) }, end: { date: dag(19) } },
        { start: { date: dag(26) }, end: { date: dag(35) } }
      ]);
    } else if (!KALENDER_ID || !API_SLEUTEL) {
      toonFout();
    } else {
      var tot = new Date(vandaag.getFullYear(), vandaag.getMonth() + MAANDEN_VOORUIT, 1);
      var url = 'https://www.googleapis.com/calendar/v3/calendars/' +
        encodeURIComponent(KALENDER_ID) + '/events' +
        '?key=' + encodeURIComponent(API_SLEUTEL) +
        '&timeMin=' + encodeURIComponent(vandaag.toISOString()) +
        '&timeMax=' + encodeURIComponent(tot.toISOString()) +
        '&singleEvents=true&orderBy=startTime&maxResults=2500';
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) { klaar(data.items || []); })
        .catch(toonFout);
    }
  }

  /* ---- 7. Jaartal in de footer ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
