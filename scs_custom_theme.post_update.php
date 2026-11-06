<?php

/**
 * @file
 * Install the home page on sites that already had this theme enabled.
 */

declare(strict_types=1);

use Drupal\Core\Config\FileStorage;

/**
 * Installs the home page content types and the default start page.
 *
 * The content types used to ship with field names Drupal rejects and with
 * view displays that had no formatter settings, so enabling the theme never
 * created them. The start page itself lived only in the development database.
 */
function scs_custom_theme_post_update_install_home_page(): void {
  $modules = [
    'image',
    'link',
    'media',
    'media_library',
    'text',
    'content_translation',
    'single_content_sync',
  ];
  $missing = array_values(array_filter(
    $modules,
    static fn (string $module): bool => !\Drupal::moduleHandler()->moduleExists($module),
  ));
  if ($missing !== []) {
    \Drupal::service('module_installer')->install($missing);
  }

  $theme_path = \Drupal::service('extension.list.theme')->getPath('scs_custom_theme');
  $source = new FileStorage($theme_path . '/config/install');
  \Drupal::service('config.installer')->installOptionalConfig($source);

  $uuid = 'adf0811e-df79-4448-a209-ea9b2b890d31';
  $storage = \Drupal::entityTypeManager()->getStorage('node');
  if ($storage->loadByProperties(['uuid' => $uuid]) !== []) {
    return;
  }

  \Drupal::configFactory()
    ->getEditable('single_content_sync.settings')
    ->set('site_uuid_check', FALSE)
    ->save();

  \Drupal::service('entity_field.manager')->clearCachedFieldDefinitions();

  $zip_path = $theme_path . '/content/home-content.zip';
  $helper = \Drupal::service('single_content_sync.helper');
  $importer = \Drupal::service('single_content_sync.importer');
  $zip = $helper->createZipInstance($zip_path);
  $import_directory = $helper->createImportDirectory();
  $zip->extract($import_directory);

  $content_files = [];
  foreach ($zip->listContents() as $zip_file) {
    $extracted = $import_directory . '/' . $zip_file;
    if (!is_file($extracted)) {
      continue;
    }
    if (str_starts_with($zip_file, 'assets')) {
      $importer->importAssets($extracted, $zip_file);
      continue;
    }
    if (str_ends_with($zip_file, '.yml')) {
      $content_files[] = $extracted;
    }
  }

  usort($content_files, static function (string $left, string $right): int {
    return str_contains($right, 'node-home_page') <=> str_contains($left, 'node-home_page');
  });
  foreach ($content_files as $content_file) {
    $importer->importFromFile($content_file);
  }

  \Drupal::configFactory()
    ->getEditable('system.site')
    ->set('page.front', '/home')
    ->save();
}
