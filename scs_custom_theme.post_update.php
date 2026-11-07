<?php

/**
 * @file
 * Install the home page on sites that already had this theme enabled.
 */

declare(strict_types=1);

/**
 * Installs the shipped content types and pages on the first update.
 *
 * Later edits are exported into content/sync and imported again with
 * content/import-content.bash. This hook runs only once per site.
 */
function scs_custom_theme_post_update_install_home_page(): void {
  require_once __DIR__ . '/content/sync.inc';
  scs_custom_theme_import_shipped_content();
}
