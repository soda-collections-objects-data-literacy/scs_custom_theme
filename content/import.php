<?php

/**
 * @file
 * Import shipped content. Run from the host:
 * ./content/import-content.bash
 */

declare(strict_types=1);

require_once __DIR__ . '/sync.inc';

scs_custom_theme_import_shipped_content();
