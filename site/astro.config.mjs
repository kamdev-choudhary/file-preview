// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { fileURLToPath } from 'node:url';

/** The library's own source, so the site is a live test of it rather than of a stale build. */
const librarySource = fileURLToPath(new URL('../src/index.ts', import.meta.url));

export default defineConfig({
  site: 'https://kamdev-choudhary.github.io',
  base: '/fileon',
  trailingSlash: 'always',

  integrations: [
    starlight({
      title: 'fileon',
      description:
        'A framework-free web component that previews PDFs, Office documents, images, media, code and archives in the browser.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/theme.css', './src/styles/landing.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/kamdev-choudhary/fileon',
        },
        {
          icon: 'npm',
          label: 'npm',
          href: 'https://www.npmjs.com/package/fileon',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/kamdev-choudhary/fileon/edit/main/site/',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Install', slug: 'guides/install' },
            { label: 'Quick start', slug: 'guides/quick-start' },
            { label: 'Frameworks', slug: 'guides/frameworks' },
            { label: 'Supported formats', slug: 'guides/formats' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Elements', slug: 'reference/elements' },
            { label: 'Functions', slug: 'reference/functions' },
            { label: 'Events', slug: 'reference/events' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Errors', slug: 'reference/errors' },
            { label: 'Theming', slug: 'reference/theming' },
            { label: 'Custom viewers', slug: 'reference/custom-viewers' },
            { label: 'Keyboard', slug: 'reference/keyboard' },
          ],
        },
      ],
      components: {
        // The default Starlight hero is replaced by the live drop target on the
        // landing page; everything else keeps Starlight's chrome.
        Head: './src/components/Head.astro',
      },
      expressiveCode: {
        themes: ['github-dark-default', 'github-light'],
        styleOverrides: { borderRadius: '10px' },
      },
    }),
  ],

  vite: {
    resolve: {
      alias: { fileon: librarySource },
    },
  },
});
