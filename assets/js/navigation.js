(function (Drupal, once) {
  'use strict';

  Drupal.behaviors.scsCustomThemeNavigation = {
    attach: function (context) {
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
