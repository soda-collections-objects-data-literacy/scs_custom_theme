const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('language menu stays open during pointer focus loss and closes when dismissed', () => {
  const handlers = {};
  const documentHandlers = {};
  const timers = [];
  const classes = new Set();
  const attributes = {};
  const toggle = {
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (name, handler) => { handlers[`toggle:${name}`] = handler; },
    focus: () => { document.activeElement = toggle; },
  };
  const link = {};
  const switcher = {
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    },
    contains: (element) => element === toggle || element === link,
    querySelector: () => toggle,
    addEventListener: (name, handler) => { handlers[name] = handler; },
  };
  const document = {
    activeElement: toggle,
    addEventListener: (name, handler) => { documentHandlers[name] = handler; },
  };
  const Drupal = { behaviors: {} };
  const once = (name) => name === 'scsLanguageSwitcher' ? [switcher] : [];
  const window = { setTimeout: (callback) => timers.push(callback) };
  const script = fs.readFileSync(path.join(__dirname, '../assets/js/navigation.js'), 'utf8');
  vm.runInNewContext(script, { Drupal, once, document, window });
  Drupal.behaviors.scsCustomThemeNavigation.attach(document);

  handlers['toggle:click']();
  document.activeElement = null;
  if (handlers.focusout) {
    handlers.focusout({ relatedTarget: null });
  }
  timers.splice(0).forEach((callback) => callback());
  assert.equal(attributes['aria-expanded'], 'true');
  assert.equal(classes.has('is-open'), true);

  documentHandlers.click({ target: link });
  assert.equal(attributes['aria-expanded'], 'true');
  documentHandlers.click({ target: {} });
  assert.equal(attributes['aria-expanded'], 'false');

  handlers['toggle:click']();
  handlers.keydown({ key: 'Tab' });
  timers.splice(0).forEach((callback) => callback());
  assert.equal(attributes['aria-expanded'], 'false');

  handlers['toggle:click']();
  handlers.keydown({ key: 'Escape' });
  assert.equal(attributes['aria-expanded'], 'false');
  assert.equal(document.activeElement, toggle);
});