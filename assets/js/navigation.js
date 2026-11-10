(function (Drupal, once) {
  'use strict';

  Drupal.behaviors.scsCustomThemeNavigation = {
    attach: function (context) {
      once('scsLanguageSwitcher', '.language-switcher', context).forEach(function (switcher) {
        var toggle = switcher.querySelector('.language-switcher__toggle');
        if (!toggle) {
          return;
        }

        function setOpen(isOpen) {
          switcher.classList.toggle('is-open', isOpen);
          toggle.setAttribute('aria-expanded', String(isOpen));
        }

        toggle.addEventListener('click', function () {
          setOpen(!switcher.classList.contains('is-open'));
        });
        document.addEventListener('click', function (event) {
          if (!switcher.contains(event.target)) {
            setOpen(false);
          }
        });
        switcher.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            setOpen(false);
            toggle.focus();
          }
          else if (event.key === 'Tab') {
            window.setTimeout(function () {
              if (!switcher.contains(document.activeElement)) {
                setOpen(false);
              }
            }, 0);
          }
        });
      });

      once('scsCustomThemeNavigation', '.site-nav', context).forEach(function (element) {
        var links = element.querySelectorAll('a');
        links.forEach(function (link) {
          link.addEventListener('focus', function () {
            link.classList.add('is-focused');
          });
          link.addEventListener('blur', function () {
            link.classList.remove('is-focused');
          });
        });
      });
    }
  };
})(Drupal, once);
