<?php

/**
 * @file
 * Export and import the shipped Manager content.
 *
 * single_content_sync updates an entity when its UUID already exists and
 * creates it otherwise, so both commands can run again after a pull.
 */

declare(strict_types=1);

use Drupal\Component\Serialization\Yaml;
use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;

/**
 * Absolute path of the directory that holds the exported YAML and assets.
 */
function scs_custom_theme_content_sync_directory(): string {
  $theme_path = \Drupal::service('extension.list.theme')->getPath('scs_custom_theme');
  return DRUPAL_ROOT . '/' . $theme_path . '/content/sync';
}

/**
 * Enables the modules the shipped content types and the importer need.
 */
function scs_custom_theme_ensure_content_modules(): void {
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
}

/**
 * Installs content-type config that is not on the site yet.
 *
 * Existing config is left alone. Field changes still go through the normal
 * config update path.
 */
function scs_custom_theme_install_shipped_config(): void {
  $theme_path = \Drupal::service('extension.list.theme')->getPath('scs_custom_theme');
  $source = new \Drupal\Core\Config\FileStorage(DRUPAL_ROOT . '/' . $theme_path . '/config/install');
  \Drupal::service('config.installer')->installOptionalConfig($source);
  \Drupal::service('entity_field.manager')->clearCachedFieldDefinitions();
}

/**
 * Creates or updates every entity exported under content/sync.
 */
function scs_custom_theme_import_shipped_content(): void {
  scs_custom_theme_ensure_content_modules();
  scs_custom_theme_install_shipped_config();

  $sync_directory = scs_custom_theme_content_sync_directory();
  if (!is_dir($sync_directory)) {
    throw new \RuntimeException("Content directory {$sync_directory} does not exist.");
  }

  $settings = \Drupal::configFactory()->getEditable('single_content_sync.settings');
  $previous_site_check = $settings->get('site_uuid_check');
  $settings->set('site_uuid_check', FALSE)->save();

  try {
    scs_custom_theme_import_assets($sync_directory . '/assets');
    $content_files = scs_custom_theme_content_files($sync_directory);
    if ($content_files === []) {
      throw new \RuntimeException("Content directory {$sync_directory} has no YAML files.");
    }

    $importer = \Drupal::service('single_content_sync.importer');
    foreach ($content_files as $content_file) {
      $entity = $importer->importFromFile($content_file);
      $label = $entity ? $entity->label() : basename($content_file);
      fwrite(STDOUT, 'Imported ' . basename($content_file) . ' (' . $label . ')' . PHP_EOL);
    }
  }
  finally {
    $settings->set('site_uuid_check', $previous_site_check)->save();
  }

  $front = \Drupal::config('system.site')->get('page.front');
  if ($front === NULL || $front === '' || $front === '/node') {
    \Drupal::configFactory()->getEditable('system.site')->set('page.front', '/home')->save();
    fwrite(STDOUT, 'Front page set to /home' . PHP_EOL);
  }
}

/**
 * Rewrites content/sync from the entities listed in content/manifest.yml.
 */
function scs_custom_theme_export_shipped_content(): void {
  scs_custom_theme_ensure_content_modules();

  $theme_path = \Drupal::service('extension.list.theme')->getPath('scs_custom_theme');
  $manifest_path = DRUPAL_ROOT . '/' . $theme_path . '/content/manifest.yml';
  $manifest = Yaml::decode((string) file_get_contents($manifest_path));
  if (!is_array($manifest)) {
    throw new \RuntimeException("Manifest {$manifest_path} is empty.");
  }

  $sync_directory = scs_custom_theme_content_sync_directory();
  scs_custom_theme_reset_directory($sync_directory);

  $exporter = \Drupal::service('single_content_sync.exporter');
  $helper = \Drupal::service('single_content_sync.helper');
  \Drupal::service('single_content_sync.store')->delete('export.assets');

  foreach (scs_custom_theme_entities_to_export($manifest) as $entity) {
    $exporter->resetCache();
    $yaml = $exporter->doExportToYml($entity, TRUE);
    $filename = $helper->generateContentFileName($entity) . '.yml';
    $path = $sync_directory . '/' . $filename;
    if (file_put_contents($path, $yaml) === FALSE) {
      throw new \RuntimeException("Could not write {$path}.");
    }
    fwrite(STDOUT, 'Exported ' . $filename . PHP_EOL);
  }

  scs_custom_theme_export_assets($sync_directory . '/assets');
  \Drupal::service('single_content_sync.store')->delete('export.assets');
}

/**
 * Copies shipped files into the public and private file systems.
 */
function scs_custom_theme_import_assets(string $assets_directory): void {
  if (!is_dir($assets_directory)) {
    return;
  }

  $file_system = \Drupal::service('file_system');
  $wrappers = \Drupal::service('stream_wrapper_manager');
  $iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($assets_directory, FilesystemIterator::SKIP_DOTS),
  );
  foreach ($iterator as $file) {
    if (!$file->isFile()) {
      continue;
    }
    $relative = substr($file->getPathname(), strlen($assets_directory) + 1);
    $scheme = strstr($relative, '/', TRUE);
    $target = $scheme !== FALSE && $wrappers->isValidScheme($scheme)
      ? $scheme . '://' . substr($relative, strlen($scheme) + 1)
      : 'public://' . $relative;
    $directory = $file_system->dirname($target);
    $file_system->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS);
    $file_system->copy($file->getPathname(), $target, FileExists::Replace);
    fwrite(STDOUT, 'Asset ' . $target . PHP_EOL);
  }
}

/**
 * Copies file URIs collected during export next to the YAML files.
 */
function scs_custom_theme_export_assets(string $assets_directory): void {
  $uris = \Drupal::service('single_content_sync.store')->get('export.assets') ?? [];
  $file_system = \Drupal::service('file_system');
  foreach ($uris as $uri) {
    if (!is_string($uri) || !str_contains($uri, '://')) {
      continue;
    }
    $source = $file_system->realpath($uri);
    if ($source === FALSE || !is_file($source)) {
      fwrite(STDERR, "Skipped missing asset {$uri}" . PHP_EOL);
      continue;
    }
    [$scheme, $relative] = explode('://', $uri, 2);
    $target = $assets_directory . '/' . $scheme . '/' . $relative;
    if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0775, TRUE) && !is_dir(dirname($target))) {
      throw new \RuntimeException("Could not create " . dirname($target));
    }
    if (!copy($source, $target)) {
      throw new \RuntimeException("Could not copy {$uri} to {$target}.");
    }
    fwrite(STDOUT, 'Asset ' . $scheme . '/' . $relative . PHP_EOL);
  }
}

/**
 * YAML files, nodes first so menu links resolve to pages that already exist.
 *
 * @return list<string>
 */
function scs_custom_theme_content_files(string $sync_directory): array {
  $files = glob($sync_directory . '/*.yml') ?: [];
  usort($files, static function (string $left, string $right): int {
    $rank = static function (string $path): int {
      return str_starts_with(basename($path), 'node-') ? 0 : 1;
    };
    return $rank($left) <=> $rank($right);
  });
  return $files;
}

/**
 * @param array<string, mixed> $manifest
 *
 * @return list<\Drupal\Core\Entity\FieldableEntityInterface>
 */
function scs_custom_theme_entities_to_export(array $manifest): array {
  $entity_type_manager = \Drupal::entityTypeManager();
  $repository = \Drupal::service('entity.repository');
  $entities = [];
  $seen = [];

  $remember = static function (object $entity) use (&$entities, &$seen): void {
    $key = $entity->getEntityTypeId() . ':' . $entity->uuid();
    if (isset($seen[$key])) {
      return;
    }
    $seen[$key] = TRUE;
    $entities[] = $entity;
  };

  $node_storage = $entity_type_manager->getStorage('node');
  foreach ($manifest['node_bundles'] ?? [] as $bundle) {
    foreach ($node_storage->loadByProperties(['type' => $bundle]) as $node) {
      $remember($node);
    }
  }
  foreach ($manifest['node_uuids'] ?? [] as $uuid) {
    $node = $repository->loadEntityByUuid('node', $uuid);
    if ($node === NULL) {
      throw new \RuntimeException("Manifest node {$uuid} does not exist.");
    }
    $remember($node);
  }

  $menu_storage = $entity_type_manager->getStorage('menu_link_content');
  foreach ($manifest['menus'] ?? [] as $menu_name) {
    foreach ($menu_storage->loadByProperties(['menu_name' => $menu_name]) as $link) {
      $remember($link);
    }
  }

  return $entities;
}

/**
 * Removes a previous export so entities dropped from the manifest disappear.
 */
function scs_custom_theme_reset_directory(string $directory): void {
  if (is_dir($directory)) {
    $iterator = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
      RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($iterator as $item) {
      $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
  }
  elseif (!mkdir($directory, 0775, TRUE) && !is_dir($directory)) {
    throw new \RuntimeException("Could not create {$directory}.");
  }
}
