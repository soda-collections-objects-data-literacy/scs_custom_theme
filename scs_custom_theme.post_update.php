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

/**
 * Installs paired logo fields and migrates current funding page revisions.
 */
function scs_custom_theme_post_update_logo_pairs(&$sandbox): void {
  if (!isset($sandbox['last_id'])) {
    $created_fields = scs_custom_theme_install_logo_fields();
    scs_custom_theme_update_logo_displays($created_fields);
    $sandbox['last_id'] = 0;
    $latest_ids = \Drupal::entityTypeManager()->getStorage('node')->getQuery()
      ->accessCheck(FALSE)
      ->condition('type', 'funding_and_partners')
      ->sort('nid', 'DESC')
      ->range(0, 1)
      ->execute();
    $sandbox['max_id'] = (int) (reset($latest_ids) ?: 0);
  }

  $storage = \Drupal::entityTypeManager()->getStorage('node');
  $ids = $storage->getQuery()
    ->accessCheck(FALSE)
    ->condition('type', 'funding_and_partners')
    ->condition('nid', $sandbox['last_id'], '>')
    ->condition('nid', $sandbox['max_id'], '<=')
    ->sort('nid')
    ->range(0, 20)
    ->execute();

  foreach ($ids as $id) {
    $transaction = \Drupal::database()->startTransaction();
    try {
      \Drupal::database()->select('node', 'n')
        ->fields('n', ['nid'])
        ->condition('nid', $id)
        ->forUpdate()
        ->execute()->fetchField();
      $node = $storage->loadUnchanged($id);
      if ($node) {
        $needs_migration = FALSE;
        foreach (array_keys($node->getTranslationLanguages()) as $language) {
          if (!(bool) $node->getTranslation($language)->get('field_logos_migrated')->value) {
            $needs_migration = TRUE;
            break;
          }
        }
        if ($needs_migration) {
          if ((int) $storage->getLatestRevisionId($id) !== (int) $node->getRevisionId()) {
            throw new \RuntimeException("Node {$id} has a pending revision; resolve it before migrating logos.");
          }
          $node->setNewRevision(TRUE);
          $node->save();
        }
      }
      unset($transaction);
    }
    catch (\Throwable $exception) {
      $transaction->rollBack();
      throw $exception;
    }
    $sandbox['last_id'] = (int) $id;
  }

  $sandbox['#finished'] = $ids === [] || $sandbox['last_id'] >= $sandbox['max_id']
    ? 1
    : $sandbox['last_id'] / max(1, $sandbox['max_id']);
}

/**
 * Creates missing field configuration without replacing existing definitions.
 *
 * @return string[]
 *   Names of newly created field instances.
 */
function scs_custom_theme_install_logo_fields(): array {
  $source = new \Drupal\Core\Config\FileStorage(__DIR__ . '/config/install');
  $manager = \Drupal::entityTypeManager();
  $created_fields = [];
  foreach (scs_custom_theme_logo_field_names() as $name => $type) {
    foreach (['field_storage_config' => 'field.storage.node.' . $name, 'field_config' => 'field.field.node.funding_and_partners.' . $name] as $entity_type => $config_name) {
      $storage = $manager->getStorage($entity_type);
      $id = $entity_type === 'field_storage_config' ? 'node.' . $name : 'node.funding_and_partners.' . $name;
      $field = $storage->load($id);
      if (!$field) {
        $data = $source->read($config_name);
        if (!$data) {
          throw new \RuntimeException("Missing configuration {$config_name}.");
        }
        $field = $storage->create($data);
        $field->save();
        if ($entity_type === 'field_config') {
          $created_fields[] = $name;
        }
      }
      $definition = $entity_type === 'field_storage_config' ? $field : $field->getFieldStorageDefinition();
      if ($field->getType() !== $type || !$field->isTranslatable() || $definition->getCardinality() !== 1) {
        throw new \RuntimeException("Incompatible field configuration {$config_name}.");
      }
    }
  }
  $field_storage = $manager->getStorage('field_storage_config')->load('node.field_logos_migrated');
  if (!$field_storage) {
    $field_storage = $manager->getStorage('field_storage_config')->create([
      'field_name' => 'field_logos_migrated',
      'entity_type' => 'node',
      'type' => 'boolean',
      'cardinality' => 1,
      'translatable' => TRUE,
    ]);
    $field_storage->save();
  }
  if (!$manager->getStorage('field_config')->load('node.funding_and_partners.field_logos_migrated')) {
    $manager->getStorage('field_config')->create([
      'field_storage' => $field_storage,
      'bundle' => 'funding_and_partners',
      'label' => 'Logos migrated',
      'required' => FALSE,
      'translatable' => TRUE,
    ])->save();
  }
  \Drupal::service('entity_field.manager')->clearCachedFieldDefinitions();
  return $created_fields;
}

/**
 * Returns the paired fields and their types.
 */
function scs_custom_theme_logo_field_names(): array {
  $fields = [];
  foreach (['funding' => 5, 'partner' => 10] as $group => $count) {
    for ($index = 1; $index <= $count; $index++) {
      $fields["field_{$group}_{$index}"] = 'image';
      $fields["field_{$group}_{$index}_link"] = 'link';
    }
  }
  $fields['field_soda_logo_link'] = 'link';
  return $fields;
}

/**
 * Adds new components to existing default displays without replacing them.
 */
function scs_custom_theme_update_logo_displays(array $created_fields = []): void {
  $source = new \Drupal\Core\Config\FileStorage(__DIR__ . '/config/install');
  foreach (['form', 'view'] as $mode) {
    $storage = \Drupal::entityTypeManager()->getStorage('entity_' . $mode . '_display');
    $display = $storage->load('node.funding_and_partners.default');
    $defaults = $source->read('core.entity_' . $mode . '_display.node.funding_and_partners.default');
    if (!$display) {
      $storage->create($defaults)->save();
      continue;
    }
    $hidden = $display->get('hidden');
    foreach (scs_custom_theme_logo_field_names() as $name => $type) {
      if ($name !== 'field_logos_migrated' && !$display->getComponent($name) && (!isset($hidden[$name]) || in_array($name, $created_fields, TRUE))) {
        $display->setComponent($name, $defaults['content'][$name]);
      }
      elseif ($mode === 'form' && in_array($name, $created_fields, TRUE) && ($component = $display->getComponent($name))) {
        $component['weight'] = $defaults['content'][$name]['weight'];
        $display->setComponent($name, $component);
      }
    }
    if ($mode === 'form' && $created_fields !== []) {
      foreach (['uid' => 40, 'created' => 41, 'langcode' => 42, 'path' => 43, 'status' => 44, 'revision_log' => 45] as $name => $weight) {
        $component = $display->getComponent($name);
        if ($component && ($component['weight'] ?? 0) < 36) {
          $component['weight'] = $weight;
          $display->setComponent($name, $component);
        }
      }
    }
    foreach (['field_founding_logos', 'field_partner_logos', 'field_logos_migrated'] as $name) {
      $display->removeComponent($name);
    }
    $display->save();
  }
}

/**
 * Permanently removes the superseded multivalue funding and partner fields.
 */
function scs_custom_theme_post_update_remove_legacy_logo_fields(): void {
  $manager = \Drupal::entityTypeManager();
  $node_storage = $manager->getStorage('node');
  $ids = $node_storage->getQuery()
    ->accessCheck(FALSE)
    ->condition('type', 'funding_and_partners')
    ->execute();
  foreach ($ids as $id) {
    $node = $node_storage->load($id);
    foreach (array_keys($node->getTranslationLanguages()) as $language) {
      $translation = $node->getTranslation($language);
      if (!$translation->hasField('field_logos_migrated')) {
        foreach (['field_founding_logos', 'field_partner_logos'] as $legacy_field) {
          if ($translation->hasField($legacy_field)) {
            throw new \RuntimeException("Refusing to delete legacy logo fields before node {$id} ({$language}) is migrated.");
          }
        }
        continue;
      }
      if (!(bool) $translation->get('field_logos_migrated')->value) {
        throw new \RuntimeException("Refusing to delete legacy logo fields before node {$id} ({$language}) is migrated.");
      }
    }
  }

  foreach (['field_founding_logos', 'field_partner_logos', 'field_logos_migrated'] as $name) {
    $storage = $manager->getStorage('field_storage_config')->load('node.' . $name);
    if (!$storage) {
      continue;
    }
    $bundles = $storage->getBundles();
    if (array_diff(array_keys($bundles), ['funding_and_partners']) !== []) {
      throw new \RuntimeException("Refusing to delete shared field storage {$name}.");
    }
    $instance = $manager->getStorage('field_config')->load('node.funding_and_partners.' . $name);
    if ($instance) {
      $instance->delete();
    }
    $remaining = $manager->getStorage('field_storage_config')->load('node.' . $name);
    if ($remaining) {
      throw new \RuntimeException("Legacy field storage {$name} remains after deleting its only instance.");
    }
  }

  if (\Drupal::moduleHandler()->moduleExists('scs_theme_content')) {
    \Drupal::service('module_installer')->uninstall(['scs_theme_content']);
  }
  \Drupal::service('entity_field.manager')->clearCachedFieldDefinitions();
}
