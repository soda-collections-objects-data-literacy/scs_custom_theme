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

  Drupal.behaviors.scsCustomThemeProjectActions = {
    attach: function (context) {
      once('scsCustomThemeProjectActions', '.project-card__actions-toggle', context).forEach(function (toggle) {
        var actionContainer = toggle.closest('.project-card__edit');
        var actions = actionContainer ? actionContainer.querySelector('.project-card__actions') : null;

        if (!actions) {
          return;
        }

        toggle.addEventListener('click', function (event) {
          event.stopPropagation();
          var expanded = toggle.getAttribute('aria-expanded') === 'true';

          document.querySelectorAll('.project-card__actions[aria-hidden="false"]').forEach(function (openActions) {
            openActions.hidden = true;
            openActions.setAttribute('aria-hidden', 'true');
            var openToggle = openActions.closest('.project-card__edit').querySelector('.project-card__actions-toggle');
            openToggle.setAttribute('aria-expanded', 'false');
          });

          toggle.setAttribute('aria-expanded', String(!expanded));
          actions.hidden = expanded;
          actions.setAttribute('aria-hidden', String(expanded));

          if (!expanded) {
            var firstAction = actions.querySelector('[role="menuitem"]');
            if (firstAction) {
              firstAction.focus();
            }
          }
        });

        toggle.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle.click();
          }
        });

        actions.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            actions.hidden = true;
            actions.setAttribute('aria-hidden', 'true');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
          }
        });

        document.addEventListener('click', function (event) {
          if (!actions.hidden && !actions.contains(event.target) && !toggle.contains(event.target)) {
            actions.hidden = true;
            actions.setAttribute('aria-hidden', 'true');
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      });

      once('scsCustomThemeProjectDeleteConfirm', '.project-card__delete-trigger', context).forEach(function (trigger) {
        var parentContainer = trigger.closest('.project--card') || trigger.closest('.project__delete');
        var dialog = parentContainer ? parentContainer.querySelector('.project-card__delete-confirmation') : null;
        var cancelButton = dialog ? dialog.querySelector('.project-card__delete-confirmation__cancel') : null;
        var confirmLink = dialog ? dialog.querySelector('.project-card__delete-confirmation__confirm') : null;

        if (!dialog || !cancelButton || !confirmLink) {
          return;
        }

        var closeDialog = function () {
          dialog.hidden = true;
          dialog.setAttribute('aria-hidden', 'true');
        };

        var openDialog = function () {
          dialog.hidden = false;
          dialog.setAttribute('aria-hidden', 'false');
          cancelButton.focus();
        };

        trigger.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          openDialog();
        });

        cancelButton.addEventListener('click', function () {
          closeDialog();
        });

        dialog.addEventListener('click', function (event) {
          if (event.target === dialog || event.target.classList.contains('project-card__delete-confirmation__backdrop')) {
            closeDialog();
          }
        });

        document.addEventListener('keydown', function (event) {
          if (!dialog.hidden && event.key === 'Escape') {
            closeDialog();
          }
        });

        confirmLink.addEventListener('click', function (event) {
          var href = confirmLink.getAttribute('href');
          if (!href) {
            event.preventDefault();
            closeDialog();
            return;
          }
          closeDialog();
        });
      });
    }
  };

  Drupal.behaviors.scsCustomThemeProjectNoteEdit = {
    attach: function (context) {
      once('scsCustomThemeProjectNoteEdit', '.project__note', context).forEach(function (section) {
        var trigger = section.querySelector('.project-note-edit-trigger');
        var overlay = section.querySelector('.project-note-edit-overlay');
        var cancelButton = overlay ? overlay.querySelector('.project-note-form__cancel') : null;

        if (!trigger || !overlay) {
          return;
        }

        var closeOverlay = function () {
          overlay.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        };

        var openOverlay = function () {
          overlay.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
          var field = overlay.querySelector('textarea');
          if (field) {
            field.focus();
          }
        };

        trigger.addEventListener('click', openOverlay);
        if (cancelButton) {
          cancelButton.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeOverlay();
          });
        }

        overlay.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeOverlay();
          }
        });

      });
    }
  };

  Drupal.behaviors.scsCustomThemeProjectMembersEdit = {
    attach: function (context) {
      once('scsCustomThemeProjectMembersEdit', '.project__members', context).forEach(function (section) {
        var trigger = section.querySelector('.project-members-edit-trigger');
        var overlay = section.querySelector('.project-members-edit-overlay');
        var cancelButton = overlay ? overlay.querySelector('.project-members-edit-overlay__cancel') : null;

        if (!trigger || !overlay) {
          return;
        }

        var closeOverlay = function () {
          overlay.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          overlay.querySelectorAll('.project-member__remove-confirm').forEach(function (confirmBox) {
            confirmBox.hidden = true;
          });
          overlay.querySelectorAll('.project-member__remove-trigger').forEach(function (removeTrigger) {
            removeTrigger.setAttribute('aria-expanded', 'false');
          });
          trigger.focus();
        };

        var openOverlay = function () {
          overlay.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');

          var firstInput = overlay.querySelector('input:not([type="hidden"]), select, textarea');
          if (firstInput) {
            firstInput.focus();
          }
        };

        trigger.addEventListener('click', openOverlay);

        if (cancelButton) {
          cancelButton.addEventListener('click', closeOverlay);
        }

        overlay.querySelectorAll('.project-member__remove-trigger').forEach(function (removeTrigger) {
          var removeConfirm = removeTrigger.closest('.project-member__remove-menu')?.querySelector('.project-member__remove-confirm');
          if (!removeConfirm) {
            return;
          }

          removeTrigger.addEventListener('click', function (event) {
            event.preventDefault();
            removeConfirm.hidden = false;
            removeTrigger.setAttribute('aria-expanded', 'true');
          });

          var cancelLink = removeConfirm.querySelector('a[href]');
          if (cancelLink) {
            cancelLink.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              removeConfirm.hidden = true;
              removeTrigger.setAttribute('aria-expanded', 'false');
              removeTrigger.focus();
            });
          }
        });

        overlay.addEventListener('click', function (event) {
          if (event.target === overlay || event.target.classList.contains('overlay__backdrop')) {
            closeOverlay();
          }
        });

        overlay.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeOverlay();
          }
        });
      });
    }
  };
})(Drupal, once);
