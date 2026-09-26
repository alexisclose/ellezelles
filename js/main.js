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

  /* ---- 5. Contactformulier ----
     Zolang er geen verzenddienst is ingesteld (zie de uitleg in
     contact.html) controleren we de velden en tonen we een duidelijke
     melding in plaats van te doen alsof het bericht vertrokken is. */
  var contactform = document.getElementById('contactform');
  if (contactform) {
    var melding = document.getElementById('formmelding');
    contactform.addEventListener('submit', function (e) {
      // Is er wel een verzendadres ingesteld? Dan gewoon laten versturen.
      var actie = contactform.getAttribute('action');
      if (actie) { return; }

      e.preventDefault();

      if (!contactform.checkValidity()) {
        contactform.reportValidity();
        return;
      }
      melding.textContent =
        'Het formulier is nog niet gekoppeld aan een verzenddienst, ' +
        'dus dit bericht wordt nog niet verstuurd. Mail ons intussen ' +
        'rechtstreeks via het adres hierboven.';
      melding.classList.add('is-zichtbaar');
    });
  }

  /* ---- 6. Jaartal in de footer ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
