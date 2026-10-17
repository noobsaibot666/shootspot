# ShootSpot docs site

Public pages on the shared docs hub (D-35): https://docs.alan-design.com/shootspot/. Only `legal/` and `user-guide/` are published; the repo's `docs/` folder stays internal.

Standalone npm project (not part of the pnpm workspace), same Astro + Starlight versions as the other hub sites.

## Deploy (Mac)

```bash
cd docs-site
npm install && npm run build
rsync -a --delete dist/ /Volumes/Gaia/04_DEV/web/www/website/docs-site/dist/shootspot/
```

The hub's `docs-nginx` container serves `docs-site/dist/` from that share read-only, so no restart is needed. The hub homepage card lives in web_three `docs-site/homepage/index.html`, copied to both `docs-site/homepage/` and `docs-site/dist/index.html` on the share.

When legal wording changes, also bump the version in `services/api/src/legal.ts` and the "Version" line on each legal page.
