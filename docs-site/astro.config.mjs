import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  // ShootSpot's public pages on the shared docs hub (D-35). Only the user guide and the
  // legal pages are published here; the repo's docs/ folder stays internal.
  site: 'https://docs.alan-design.com',
  base: '/shootspot',
  integrations: [
    starlight({
      title: 'ShootSpot',
      sidebar: [
        {
          label: 'User Guide',
          autogenerate: { directory: 'user-guide' },
        },
        {
          label: 'Legal',
          autogenerate: { directory: 'legal' },
        },
      ],
    }),
  ],
});
