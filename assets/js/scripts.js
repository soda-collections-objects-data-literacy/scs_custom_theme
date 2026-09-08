(function (Drupal, once) {
  'use strict';

  Drupal.behaviors.scsCustomThemeBreadcrumb = {
    attach: function (context) {
      once('scsCustomThemeBreadcrumb', 'nav[aria-labelledby="system-breadcrumb"]', context).forEach(function (breadcrumb) {
        var items = breadcrumb.querySelectorAll('ol > li');

        if (items.length <= 1) {
          breadcrumb.hidden = true;
        }
      });
    }
  };

  Drupal.behaviors.scsCustomThemeAccountMenu = {
    attach: function (context) {
      once('scsCustomThemeAccountMenu', '.dashboard-sidebar__account-menu-header', context).forEach(function (header) {
        var contentId = header.getAttribute('aria-controls');
        var content = contentId ? document.getElementById(contentId) : null;

        if (!content) {
          return;
        }

        header.addEventListener('click', function () {
          var expanded = header.getAttribute('aria-expanded') === 'true';
          header.setAttribute('aria-expanded', String(!expanded));
          content.hidden = expanded;
        });
      });
    }
  };

  Drupal.behaviors.scsCustomThemeProjectNavigation = {
    attach: function (context) {
      once('scsCustomThemeProjectNavigation', '.dashboard-sidebar__projectnav', context).forEach(function (navigation) {
        var list = navigation.querySelector('.dashboard-sidebar__project-list');
        var items = list ? Array.prototype.slice.call(list.children) : [];
        var seeAll = navigation.querySelector('.dashboard-sidebar__projects-see-all');
        var projects = navigation.closest('.dashboard-sidebar__projects');
        var sidebar = navigation.closest('.dashboard-sidebar');
        var secondaryNavigation = sidebar ? sidebar.querySelector('.dashboard-sidebar__secondary-nav') : null;
        var accountButton = sidebar ? sidebar.querySelector('.dashboard-sidebar__account-menu-header') : null;

        if (!list || !seeAll || !items.length || !projects || !secondaryNavigation || !accountButton) {
          return;
        }

        var updateVisibility = function () {
          items.forEach(function (item) {
            item.hidden = false;
          });

          var secondaryRect = secondaryNavigation.getBoundingClientRect();
          var accountRect = accountButton.getBoundingClientRect();
          var listRect = list.getBoundingClientRect();
          var projectsMarginBottom = parseFloat(window.getComputedStyle(projects).marginBottom) || 0;
          var availableBottom = Math.min(secondaryRect.top, accountRect.top);
          var availableHeight = Math.max(0, availableBottom - listRect.top - seeAll.offsetHeight - projectsMarginBottom);
          var usedHeight = 0;

          items.forEach(function (item) {
            var itemHeight = item.getBoundingClientRect().height;
            if (usedHeight + itemHeight <= availableHeight) {
              usedHeight += itemHeight;
            }
            else {
              item.hidden = true;
            }
          });

          list.style.maxHeight = usedHeight + 'px';
        };

        updateVisibility();
        window.addEventListener('resize', updateVisibility);
      });
    }
  };
})(Drupal, once);
