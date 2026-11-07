#!/usr/bin/env bash
# Rewrite content/sync from the entities listed in content/manifest.yml.
set -euo pipefail

container="${SCS_MANAGER_CONTAINER:-manager--drupal--app}"
script="/opt/drupal/web/themes/custom/scs_custom_theme/content/export.php"

exec docker exec "$container" drush php:script "$script"
