#!/usr/bin/env bash
# Create or update the shipped pages from content/sync.
set -euo pipefail

container="${SCS_MANAGER_CONTAINER:-manager--drupal--app}"
script="/opt/drupal/web/themes/custom/scs_custom_theme/content/import.php"

exec docker exec "$container" drush php:script "$script"
