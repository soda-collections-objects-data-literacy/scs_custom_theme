# SCS Custom Theme

A minimal Drupal 10/11 starter theme.

## Included

- Basic theme info and library definitions
- Simple page and HTML Twig templates
- A starter SCSS entry point compiled to CSS
- Basic navigation JavaScript

## Build

Compile the stylesheet with:

```bash
sass assets/scss/test.scss assets/css/styles.css
```

## Home page and legal pages

The public start page, its blocks, and the legal pages are shipped as
configuration in `config/install` and as Single Content Sync YAML in
`content/sync`. `content/manifest.yml` lists which nodes and menus the export
writes into that directory.

On a development site, after editing those pages:

```bash
./content/export-content.bash
```

Commit `content/sync` and push. On another site, pull and run:

```bash
./content/import-content.bash
```

The import creates an entity when its UUID is new and updates it when the UUID
already exists, so the same command can run again. The container name defaults
to `manager--drupal--app`; set `SCS_MANAGER_CONTAINER` when it differs.

`drush updatedb` still runs that import once, for sites that have not imported
the pages yet. Later changes go through `import-content.bash`.
