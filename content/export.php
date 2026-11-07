<?php

/**
 * @file
 * Export shipped content. Run from the host:
 * ./content/export-content.bash
 */

declare(strict_types=1);

require_once __DIR__ . '/sync.inc';

scs_custom_theme_export_shipped_content();
