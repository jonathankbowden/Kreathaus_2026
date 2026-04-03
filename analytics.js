/**
 * Kreathaus Analytics — Full Engagement Tracking
 * GA4 custom events for kreathaus.com
 */
(function () {
  'use strict';

  function gtag() { window.dataLayer.push(arguments); }

  // ─── Scroll Depth Tracking ───
  const scrollThresholds = [25, 50, 75, 90];
  const scrollFired = {};

  window.addEventListener('scroll', function () {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const pct = Math.round((scrollTop / docHeight) * 100);

    scrollThresholds.forEach(function (threshold) {
      if (pct >= threshold && !scrollFired[threshold]) {
        scrollFired[threshold] = true;
        gtag('event', 'scroll_depth', {
          percent: threshold,
          page: window.location.pathname
        });
      }
    });
  }, { passive: true });

  // ─── Navigation Click Tracking ───
  document.querySelectorAll('.nav-link, .nav-logo').forEach(function (link) {
    link.addEventListener('click', function () {
      gtag('event', 'nav_click', {
        link_text: this.textContent.trim(),
        link_url: this.getAttribute('href')
      });
    });
  });

  // ─── Contact Link Tracking ───
  document.querySelectorAll('.contact-links .btn, .case-footer .btn').forEach(function (link) {
    link.addEventListener('click', function () {
      var href = this.getAttribute('href') || '';
      var type = href.startsWith('mailto:') ? 'email' : 'linkedin';
      gtag('event', 'contact_click', {
        contact_type: type,
        link_text: this.textContent.trim()
      });
    });
  });

  // ─── Project Card Click Tracking ───
  document.querySelectorAll('.project-link-wrapper').forEach(function (card) {
    card.addEventListener('click', function () {
      var title = this.querySelector('.project-title');
      gtag('event', 'project_click', {
        project_name: title ? title.textContent.trim() : 'unknown'
      });
    });
  });

  // ─── Carousel Interaction Tracking ───
  document.querySelectorAll('.carousel-dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      var carousel = this.closest('[data-carousel]');
      var project = carousel ? carousel.closest('.project') : null;
      var title = project ? project.querySelector('.project-title') : null;
      gtag('event', 'carousel_interact', {
        project_name: title ? title.textContent.trim() : 'homepage',
        method: 'dot_click'
      });
    });
  });

  // ─── Outbound Link Tracking ───
  document.querySelectorAll('a[target="_blank"], a[href^="http"]').forEach(function (link) {
    if (link.hostname && link.hostname !== window.location.hostname) {
      link.addEventListener('click', function () {
        gtag('event', 'outbound_click', {
          link_url: this.href,
          link_text: this.textContent.trim()
        });
      });
    }
  });

  // ─── Case Study "Explore More" Tracking ───
  document.querySelectorAll('.explore-title').forEach(function (link) {
    link.addEventListener('click', function () {
      gtag('event', 'explore_more_click', {
        destination: this.textContent.trim(),
        from_page: window.location.pathname
      });
    });
  });

  // ─── Time on Page Tracking (30s, 60s, 120s, 300s) ───
  var timeThresholds = [30, 60, 120, 300];
  var pageStart = Date.now();

  timeThresholds.forEach(function (seconds) {
    setTimeout(function () {
      if (!document.hidden) {
        gtag('event', 'time_on_page', {
          seconds: seconds,
          page: window.location.pathname
        });
      }
    }, seconds * 1000);
  });

  // ─── Project Card Visibility / Engagement ───
  if ('IntersectionObserver' in window) {
    var cardTimers = {};
    var cardObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var card = entry.target;
        var title = card.querySelector('.project-title');
        var name = title ? title.textContent.trim() : 'unknown';

        if (entry.isIntersecting) {
          cardTimers[name] = Date.now();
        } else if (cardTimers[name]) {
          var viewTime = Math.round((Date.now() - cardTimers[name]) / 1000);
          if (viewTime >= 3) {
            gtag('event', 'project_card_engagement', {
              project_name: name,
              view_seconds: viewTime
            });
          }
          delete cardTimers[name];
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('.project').forEach(function (card) {
      cardObserver.observe(card);
    });
  }

  // ─── Case Study Section Visibility ───
  if ('IntersectionObserver' in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var heading = entry.target.querySelector('.section-title, .banner-heading, .results-dark-label');
          if (heading) {
            gtag('event', 'section_view', {
              section_name: heading.textContent.trim(),
              page: window.location.pathname
            });
          }
          sectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.case-section, .case-banner-light, .case-banner-dark, .case-results-dark').forEach(function (section) {
      sectionObserver.observe(section);
    });
  }
})();
