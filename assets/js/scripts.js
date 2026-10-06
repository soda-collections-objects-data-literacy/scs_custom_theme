(function (Drupal, once) {
  'use strict';

  /**
   * Submits a Drupal confirmation form (e.g. an entity delete form) in the
   * background via fetch, so the user never leaves the current page/overlay.
   *
   * Appends a `destination`, which Drupal's core redirect subscriber honors
   * automatically, so on success the response redirects back to a page the
   * user can actually land on instead of a fixed route.
   *
   * @param {string} url
   *   The confirmation form URL (e.g. an entity delete-form link).
   * @param {string} [destination]
   *   Path to redirect back to on success. Defaults to the current page, but
   *   callers deleting the entity they are currently viewing must pass a
   *   destination that still exists afterwards (e.g. the dashboard) -
   *   otherwise the redirect target itself 404s/500s since the entity is gone.
   * @param {function(boolean)} [onSettled]
   *   Called with `true` on success (before navigating away) or `false` on
   *   failure, so callers can restore button state.
   */
  function scsCustomThemeSubmitConfirmForm(url, destination, onSettled) {
    destination = destination || (window.location.pathname + window.location.search);
    var separator = url.indexOf('?') === -1 ? '?' : '&';
    var fetchUrl = url + separator + 'destination=' + encodeURIComponent(destination);

    fetch(fetchUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Request failed with status ' + response.status);
        }
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var content = doc.querySelector('.dashboard-content') || doc.querySelector('main') || doc.body;
        var formEl = content ? content.querySelector('form') : null;
        if (!formEl) {
          window.location.href = url;
          return;
        }

        var submitControl = formEl.querySelector('input[type="submit"], button[type="submit"]');
        var formData = new FormData(formEl);
        if (submitControl && submitControl.name) {
          formData.append(submitControl.name, submitControl.value || '');
        }

        return fetch(formEl.getAttribute('action') || fetchUrl, {
          method: 'POST',
          credentials: 'same-origin',
          body: formData,
        }).then(function (response) {
          if (response.redirected || (response.url && response.url !== fetchUrl)) {
            if (onSettled) {
              onSettled(true);
            }
            window.location.href = response.url;
          }
          else {
            // Validation/access error: fall back to the real confirmation page.
            if (onSettled) {
              onSettled(false);
            }
            window.location.href = url;
          }
        });
      })
      .catch(function () {
        if (onSettled) {
          onSettled(false);
        }
        window.location.href = url;
      });
  }

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
          event.preventDefault();
          var href = confirmLink.getAttribute('href');
          if (!href) {
            closeDialog();
            return;
          }
          confirmLink.setAttribute('aria-disabled', 'true');
          var originalText = confirmLink.textContent;
          confirmLink.textContent = Drupal.t('Deleting…');
          var destination = confirmLink.getAttribute('data-delete-destination') || trigger.getAttribute('data-delete-destination');
          scsCustomThemeSubmitConfirmForm(href, destination, function (success) {
            if (!success) {
              confirmLink.removeAttribute('aria-disabled');
              confirmLink.textContent = originalText;
            }
          });
        });
      });

      once('scsCustomThemeApplicationDeleteConfirm', '.application__details-delete-trigger', context).forEach(function (trigger) {
        var parentContainer = trigger.closest('.application__details-delete');
        var dialog = parentContainer ? parentContainer.querySelector('.application__details-delete-confirmation') : null;
        var cancelButton = dialog ? dialog.querySelector('.application__details-delete-confirmation__cancel') : null;
        var confirmLink = dialog ? dialog.querySelector('.application__details-delete-confirmation__confirm') : null;

        if (!dialog || !cancelButton) {
          return;
        }

        var closeDialog = function () {
          dialog.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        };

        trigger.addEventListener('click', function () {
          dialog.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
          cancelButton.focus();
        });

        cancelButton.addEventListener('click', closeDialog);

        if (confirmLink) {
          confirmLink.addEventListener('click', function (event) {
            event.preventDefault();
            var href = confirmLink.getAttribute('href');
            if (!href) {
              closeDialog();
              return;
            }
            confirmLink.setAttribute('aria-disabled', 'true');
            var originalText = confirmLink.textContent;
            confirmLink.textContent = Drupal.t('Deleting…');
            var destination = confirmLink.getAttribute('data-delete-destination') || trigger.getAttribute('data-delete-destination');
            scsCustomThemeSubmitConfirmForm(href, destination, function (success) {
              if (!success) {
                confirmLink.removeAttribute('aria-disabled');
                confirmLink.textContent = originalText;
              }
            });
          });
        }

        dialog.addEventListener('click', function (event) {
          if (event.target === dialog || event.target.classList.contains('application__details-delete-confirmation__backdrop')) {
            closeDialog();
          }
        });

        dialog.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog();
          }
        });
      });
    }
  };

  Drupal.behaviors.scsCustomThemeProjectNoteEdit = {
    attach: function (context) {
      once('scsCustomThemeProjectNoteEdit', '.project__note, .profile__picture', context).forEach(function (section) {
        var trigger = section.querySelector('.project-note-edit-trigger');
        var overlay = section.querySelector('.project-note-edit-overlay');
        var cancelButtons = overlay ? overlay.querySelectorAll('.project-note-form__cancel, .overlay__close') : [];

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
        cancelButtons.forEach(function (cancelButton) {
          cancelButton.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeOverlay();
          });
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

  Drupal.behaviors.scsCustomThemeProjectMembersEdit = {
    attach: function (context) {
      once('scsCustomThemeProjectMembersEdit', '.project__members', context).forEach(function (section) {
        var trigger = section.querySelector('.project-members-edit-trigger');
        var overlay = section.querySelector('.project-members-edit-overlay');
        var cancelButtons = overlay ? overlay.querySelectorAll('.project-members-edit-overlay__cancel, .overlay__close') : [];

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

        cancelButtons.forEach(function (cancelButton) {
          cancelButton.addEventListener('click', closeOverlay);
        });

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
