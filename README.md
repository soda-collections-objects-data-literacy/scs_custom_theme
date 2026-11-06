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

## Home page

The public start page is a `home_page` node. Its pieces (hero, logo banner,
information stairs, aspect previews, call to action) and the legal pages are
shipped as configuration in `config/install` and as content in
`content/home-content.zip`.

`drush updatedb` installs the missing content types and, when that start page
is not there yet, imports the content and sets the front page to `/home`.
