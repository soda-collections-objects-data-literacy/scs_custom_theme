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
          if (response.redirected) {
            var responseUrl = new URL(response.url, window.location.origin);
            if (/\/batch\/?$/.test(responseUrl.pathname) && responseUrl.searchParams.has('id')) {
              return scsCustomThemeProcessDeleteBatch(response.url, destination).then(function (finishedUrl) {
                if (onSettled) {
                  onSettled(true);
                }
                window.location.href = finishedUrl || destination;
              }).catch(function () {
                if (onSettled) {
                  onSettled(false, Drupal.t('The deletion could not be completed. Please try again.'));
                }
              });
            }
            if (onSettled) {
              onSettled(true);
            }
            window.location.href = response.url;
            return;
          }
          // Not redirected: the form was rebuilt with an error, so report it here.
          return response.text().then(function (resultHtml) {
            var resultDoc = new DOMParser().parseFromString(resultHtml, 'text/html');
            var errors = Array.prototype.map.call(resultDoc.querySelectorAll('.messages--error'), function (node) {
              return node.textContent.replace(/\s+/g, ' ').trim();
            }).filter(Boolean);
            if (onSettled) {
              onSettled(false, errors.join(' ') || Drupal.t('Deleting failed. Please try again.'));
            }
          });
        });
      })
      .catch(function () {
        if (onSettled) {
          onSettled(false);
        }
        window.location.href = url;
      });
  }

  async function scsCustomThemeProcessDeleteBatch(batchUrl, destination) {
    var progressUrl = new URL(batchUrl, window.location.origin);
    progressUrl.searchParams.set('op', 'do');
    progressUrl.searchParams.set('_format', 'json');

    while (true) {
      var response = await fetch(progressUrl.toString(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      });
      if (!response.ok) {
        throw new Error('Batch progress request failed with status ' + response.status);
      }
      var progress = await response.json();
      if (progress.status === 0) {
        throw new Error(progress.data || 'Batch processing failed.');
      }
      scsCustomThemeUpdateDeleteProgress(progress);
      if (Number(progress.percentage) >= 100) {
        break;
      }
      await new Promise(function (resolve) { window.setTimeout(resolve, 150); });
    }

    var finishUrl = new URL(batchUrl, window.location.origin);
    finishUrl.searchParams.set('op', 'finished');
    finishUrl.searchParams.delete('_format');
    var finishResponse = await fetch(finishUrl.toString(), { credentials: 'same-origin' });
    if (!finishResponse.ok) {
      throw new Error('Batch completion failed with status ' + finishResponse.status);
    }
    return finishResponse.redirected ? finishResponse.url : destination;
  }

  function scsCustomThemeUpdateDeleteProgress(progress) {
    var progressBar = document.querySelector('[data-delete-progress]');
    if (!progressBar) {
      return;
    }
    var percentage = Math.max(0, Math.min(100, Number(progress.percentage) || 0));
    var fill = progressBar.querySelector('.soda-scs-manager__progress-bar__fill');
    var value = progressBar.querySelector('.soda-scs-manager__progress-bar__text');
    if (fill) {
      fill.style.width = percentage + '%';
    }
    if (value) {
      value.textContent = percentage + '%';
    }
    progressBar.setAttribute('aria-valuenow', String(percentage));
    if (progress.message) {
      progressBar.setAttribute('aria-valuetext', progress.message);
    }
  }


  /**
   * Shows the same progress overlay used while an application is created.
   * Confirm links carry a translated message in data-throbber-message.
   */
  function scsCustomThemeEnsureThrobberOverlay() {
    var overlay = document.querySelector('.soda-scs-manager__throbber-overlay');
    if (!overlay) {
      var container = document.querySelector('.dashboard-main') || document.body;
      overlay = document.createElement('div');
      overlay.className = 'soda-scs-manager__throbber-overlay';
      overlay.innerHTML =
        '<div class="soda-scs-manager__throbber-overlay__content">' +
          '<div class="soda-scs-manager__throbber-overlay__spinner"></div>' +
          '<div class="soda-scs-manager__throbber-overlay__message"></div>' +
          '<div class="soda-scs-manager__throbber-overlay__info"></div>' +
          '<div class="soda-scs-manager__throbber-overlay__steps-container">' +
            '<ul class="soda-scs-manager__steps-list"></ul>' +
          '</div>' +
        '</div>';
      container.appendChild(overlay);
    }
    var content = overlay.querySelector('.soda-scs-manager__throbber-overlay__content');
    if (content && !content.querySelector('[data-delete-progress]')) {
      var progressGroup = document.createElement('div');
      progressGroup.className = 'soda-scs-manager__delete-progress';
      progressGroup.setAttribute('data-delete-progress-group', '');
      progressGroup.hidden = true;

      var progressLabel = document.createElement('p');
      progressLabel.className = 'soda-scs-manager__delete-progress-label';
      progressLabel.textContent = Drupal.t('Deleting WissKI Instances');

      var progressBar = document.createElement('div');
      progressBar.className = 'soda-scs-manager__progress-bar soda-scs-manager__progress-bar--delete';
      progressBar.setAttribute('data-delete-progress', '');
      progressBar.setAttribute('role', 'progressbar');
      progressBar.setAttribute('aria-valuemin', '0');
      progressBar.setAttribute('aria-valuemax', '100');
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.hidden = true;
      progressBar.innerHTML =
        '<div class="soda-scs-manager__progress-bar__track"><div class="soda-scs-manager__progress-bar__fill"></div></div>' +
        '<div class="soda-scs-manager__progress-bar__text">0%</div>';
      progressGroup.appendChild(progressLabel);
      progressGroup.appendChild(progressBar);
      var message = content.querySelector('.soda-scs-manager__throbber-overlay__message');
      content.insertBefore(progressGroup, message ? message.nextSibling : content.firstChild);
    }
  }

  function scsCustomThemeShowDeleteThrobber(confirmLink) {
    var message = confirmLink.getAttribute('data-throbber-message') || Drupal.t('Performing action, please do not close the window');
    scsCustomThemeEnsureThrobberOverlay();
    var messageEl = document.querySelector('.soda-scs-manager__throbber-overlay__message');
    var infoEl = document.querySelector('.soda-scs-manager__throbber-overlay__info');
    var stepsEl = document.querySelector('.soda-scs-manager__steps-list');
    if (messageEl) {
      messageEl.textContent = message;
    }
    var progressBar = document.querySelector('[data-delete-progress]');
    if (progressBar) {
      progressBar.setAttribute('aria-label', message);
    }
    var progressGroup = document.querySelector('[data-delete-progress-group]');
    if (progressGroup) {
      progressGroup.hidden = false;
    }
    if (infoEl) {
      infoEl.textContent = '';
    }
    if (stepsEl) {
      stepsEl.replaceChildren();
    }
    var progressBar = document.querySelector('[data-delete-progress]');
    if (progressBar) {
      progressBar.hidden = false;
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.removeAttribute('aria-valuetext');
      var fill = progressBar.querySelector('.soda-scs-manager__progress-bar__fill');
      var value = progressBar.querySelector('.soda-scs-manager__progress-bar__text');
      if (fill) {
        fill.style.width = '0%';
      }
      if (value) {
        value.textContent = '0%';
      }
    }
    var overlay = document.querySelector('.soda-scs-manager__throbber-overlay');
    if (overlay) {
      overlay.classList.add('soda-scs-manager__throbber-overlay--active');
    }
    document.dispatchEvent(new CustomEvent('scs-manager:overlay-state-change'));
  }

  function scsCustomThemeHideDeleteThrobber() {
    if (typeof Drupal.sodaScsThrobberOverlayHide === 'function') {
      Drupal.sodaScsThrobberOverlayHide();
      return;
    }
    var overlay = document.querySelector('.soda-scs-manager__throbber-overlay');
    if (overlay) {
      overlay.classList.remove('soda-scs-manager__throbber-overlay--active');
    }
    document.dispatchEvent(new CustomEvent('scs-manager:overlay-state-change'));
  }

  var scsOverlayScrollLockState = null;

  function scsCustomThemeSyncOverlayRect() {
    var main = document.querySelector('.dashboard-main');
    var root = document.documentElement;
    var names = ['top', 'left', 'width', 'height'];
    if (!main) {
      names.forEach(function (name) {
        root.style.removeProperty('--scs-overlay-' + name);
      });
      return;
    }
    var rect = main.getBoundingClientRect();
    root.style.setProperty('--scs-overlay-top', rect.top + 'px');
    root.style.setProperty('--scs-overlay-left', rect.left + 'px');
    root.style.setProperty('--scs-overlay-width', rect.width + 'px');
    root.style.setProperty('--scs-overlay-height', rect.height + 'px');
  }

  function scsCustomThemeSyncOverlayScrollLock() {
    var isOpen = Boolean(document.querySelector(
      '.overlay:not([hidden]), .project-card__delete-confirmation:not([hidden]), ' +
      '.application__details-delete-confirmation:not([hidden]), .soda-scs-manager__throbber-overlay--active'
    ));

    if (isOpen) {
      scsCustomThemeSyncOverlayRect();
    }

    if (isOpen && scsOverlayScrollLockState === null) {
      var body = document.body;
      var sidebars = Array.prototype.slice.call(document.querySelectorAll('.dashboard-sidebar'));
      scsOverlayScrollLockState = {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        sidebars: sidebars.map(function (sidebar) {
          return { element: sidebar, inert: sidebar.inert };
        })
      };
      body.style.position = 'fixed';
      body.style.top = -scsOverlayScrollLockState.scrollY + 'px';
      body.style.left = -scsOverlayScrollLockState.scrollX + 'px';
      body.style.width = '100%';
      scsOverlayScrollLockState.sidebars.forEach(function (sidebarState) {
        sidebarState.element.inert = true;
      });
    }
    else if (!isOpen && scsOverlayScrollLockState !== null) {
      var bodyToRestore = document.body;
      var state = scsOverlayScrollLockState;
      bodyToRestore.style.position = state.position;
      bodyToRestore.style.top = state.top;
      bodyToRestore.style.left = state.left;
      bodyToRestore.style.width = state.width;
      state.sidebars.forEach(function (sidebarState) {
        sidebarState.element.inert = sidebarState.inert;
      });
      scsOverlayScrollLockState = null;
      window.scrollTo(state.scrollX, state.scrollY);
    }

    document.documentElement.classList.toggle('scs-manager--overlay-scroll-locked', isOpen);
    document.body.classList.toggle('scs-manager--overlay-scroll-locked', isOpen);
    document.querySelectorAll('.dashboard-main').forEach(function (main) {
      main.classList.toggle('scs-manager--overlay-scroll-locked', isOpen);
    });
  }

  Drupal.scsCustomThemeSyncOverlayScrollLock = scsCustomThemeSyncOverlayScrollLock;
  document.addEventListener('scs-manager:overlay-state-change', scsCustomThemeSyncOverlayScrollLock);
  window.addEventListener('resize', function () {
    if (scsOverlayScrollLockState !== null) {
      scsCustomThemeSyncOverlayRect();
    }
  });

  // Overlays opened by module scripts (add application, project wizard) only toggle `hidden`.
  new MutationObserver(function (mutations) {
    var overlayToggled = mutations.some(function (mutation) {
      return mutation.target.classList && mutation.target.classList.contains('overlay');
    });
    if (overlayToggled) {
      scsCustomThemeSyncOverlayScrollLock();
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['hidden'],
    subtree: true
  });

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

  Drupal.behaviors.scsCustomThemeDeleteApplicationSlot = {
    attach: function (context) {
      once('scsCustomThemeDeleteApplicationSlot', '.application__details-right > .application__details-delete', context).forEach(function (deleteBlock) {
        var right = deleteBlock.parentElement;
        var left = document.querySelector('.application__details-left');
        if (!left) {
          return;
        }

        // Mirrors $breakpoint-l-width in scss/base/_vars.scss.
        var belowLarge = window.matchMedia('(max-width: 1200px)');
        var placeDeleteBlock = function () {
          (belowLarge.matches ? left : right).appendChild(deleteBlock);
        };

        placeDeleteBlock();
        belowLarge.addEventListener('change', placeDeleteBlock);
      });
    }
  };

  Drupal.behaviors.scsCustomThemeDashboardSearch = {
    attach: function (context) {
      once('scsCustomThemeDashboardSearch', '.dashboard__actions--search', context).forEach(function (search) {
        var input = search.querySelector('.dashboard__search');
        var cards = document.querySelectorAll('.dashboard__projects .project--card');
        if (!input || !cards.length) {
          return;
        }

        var applySearch = function () {
          var query = input.value.trim().toLocaleLowerCase();
          cards.forEach(function (card) {
            card.hidden = query !== '' && !card.textContent.toLocaleLowerCase().includes(query);
          });
        };

        input.addEventListener('input', applySearch);
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            applySearch();
          }
        });
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

        var mainContent = document.querySelector('.dashboard-main');
        if (mainContent && !mainContent.contains(dialog)) {
          mainContent.appendChild(dialog);
        }

        var isDeleting = false;

        var closeDialog = function () {
          if (isDeleting) {
            return;
          }
          dialog.hidden = true;
          dialog.setAttribute('aria-hidden', 'true');
          scsCustomThemeSyncOverlayScrollLock();
        };

        var openDialog = function () {
          dialog.hidden = false;
          dialog.setAttribute('aria-hidden', 'false');
          scsCustomThemeSyncOverlayScrollLock();
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
          if (confirmLink.getAttribute('aria-disabled') === 'true') {
            return;
          }
          var href = confirmLink.getAttribute('href');
          if (!href) {
            closeDialog();
            return;
          }
          isDeleting = true;
          confirmLink.setAttribute('aria-disabled', 'true');
          var originalText = confirmLink.textContent;
          confirmLink.textContent = Drupal.t('Deleting…');
          scsCustomThemeShowDeleteThrobber(confirmLink);
          dialog.hidden = true;
          dialog.setAttribute('aria-hidden', 'true');
          var destination = confirmLink.getAttribute('data-delete-destination') || trigger.getAttribute('data-delete-destination');
          scsCustomThemeSubmitConfirmForm(href, destination, function (success, errorText) {
            if (!success) {
              isDeleting = false;
              dialog.hidden = false;
              dialog.setAttribute('aria-hidden', 'false');
              scsCustomThemeHideDeleteThrobber();
              confirmLink.removeAttribute('aria-disabled');
              confirmLink.textContent = originalText;
              if (errorText) {
                var errorEl = dialog.querySelector('.project-card__delete-confirmation__error');
                if (!errorEl) {
                  errorEl = document.createElement('p');
                  errorEl.className = 'project-card__delete-confirmation__error';
                  errorEl.setAttribute('role', 'alert');
                  dialog.querySelector('.project-card__delete-confirmation__actions').before(errorEl);
                }
                errorEl.textContent = errorText;
              }
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

        var mainContent = document.querySelector('.dashboard-main');
        if (mainContent && dialog.classList.contains('application__details-delete-confirmation--grid') && !mainContent.contains(dialog)) {
          mainContent.appendChild(dialog);
        }

        var isDeleting = false;

        var closeDialog = function () {
          if (isDeleting) {
            return;
          }
          dialog.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
          scsCustomThemeSyncOverlayScrollLock();
        };

        trigger.addEventListener('click', function () {
          dialog.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
          scsCustomThemeSyncOverlayScrollLock();
          cancelButton.focus();
        });

        cancelButton.addEventListener('click', closeDialog);

        if (confirmLink) {
          confirmLink.addEventListener('click', function (event) {
            event.preventDefault();
            if (confirmLink.getAttribute('aria-disabled') === 'true') {
              return;
            }
            var href = confirmLink.getAttribute('href');
            if (!href) {
              closeDialog();
              return;
            }
            isDeleting = true;
            confirmLink.setAttribute('aria-disabled', 'true');
            var originalText = confirmLink.textContent;
            confirmLink.textContent = Drupal.t('Deleting…');
            scsCustomThemeShowDeleteThrobber(confirmLink);
            dialog.hidden = true;
            var destination = confirmLink.getAttribute('data-delete-destination') || trigger.getAttribute('data-delete-destination');
            scsCustomThemeSubmitConfirmForm(href, destination, function (success, errorText) {
              if (!success) {
                isDeleting = false;
                dialog.hidden = false;
                scsCustomThemeHideDeleteThrobber();
                confirmLink.removeAttribute('aria-disabled');
                confirmLink.textContent = originalText;
                if (errorText) {
                  var errorEl = dialog.querySelector('.application__details-delete-confirmation__error');
                  if (!errorEl) {
                    errorEl = document.createElement('p');
                    errorEl.className = 'application__details-delete-confirmation__error';
                    errorEl.setAttribute('role', 'alert');
                    dialog.querySelector('.application__details-delete-confirmation__actions').before(errorEl);
                  }
                  errorEl.textContent = errorText;
                }
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
          scsCustomThemeSyncOverlayScrollLock();
        };

        var openOverlay = function () {
          overlay.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
          scsCustomThemeSyncOverlayScrollLock();
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
          scsCustomThemeSyncOverlayScrollLock();
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
          scsCustomThemeSyncOverlayScrollLock();

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

  Drupal.behaviors.scsCustomThemeExternalLinks = {
    attach: function (context) {
      once('scsCustomThemeExternalLinks', 'a[href]', context).forEach(function (link) {
        var isWebLink = link.protocol === 'http:' || link.protocol === 'https:';
        if (isWebLink && link.hostname !== window.location.hostname) {
          link.classList.add('link--external');
          link.target = '_blank';
          var relTokens = new Set((link.rel || '').split(/\s+/).filter(Boolean));
          relTokens.add('noopener');
          relTokens.add('noreferrer');
          link.rel = Array.from(relTokens).join(' ');
        }
      });
    }
  };
})(Drupal, once);
