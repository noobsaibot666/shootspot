# Web Location Export Design

## Goal

Add a web-only export for every published location available to the signed-in member. The
download is a self-contained ZIP containing location metadata, GeoJSON, and the location images.
The mobile applications are not changed.

## User experience

- The signed-in account menu gets `Export all locations`.
- The location detail view gets `Export this location`.
- Both actions download a ZIP directly from the web API.
- The button shows a busy state while the archive is being generated and an accessible error if
  the download fails.
- Exported files are named using a stable ShootSpot prefix and the current date.

## Archive format

```text
shootspot-export-YYYY-MM-DD.zip
├── locations.json
├── locations.geojson
└── images/
    ├── <location-id>.webp
    └── ...
```

`locations.json` contains a versioned array of location records. Each record includes the exact
latitude/longitude, label, capture time, scouting fields, attribution, and the relative image
path. `locations.geojson` is a `FeatureCollection` using standard `[longitude, latitude]` point
coordinates and the same metadata, with `image` pointing at the relative image path.

The archive uses the ready detail derivative as a WebP image. It does not expose storage URLs,
session tokens, or internal database fields. The export endpoint only returns published records
that the signed-in web member is allowed to see after block filtering. A record-specific export
uses the same visibility rule.

## Architecture

- Add a web API route for all-location export and a route for one-location export.
- Add a storage read method so the API can retrieve the ready image bytes and assemble the archive.
- Add a small ZIP builder dependency at the API package boundary; the archive is built in memory for
  the current bounded web gallery export.
- Keep `WebRecord` unchanged so normal web pages continue to omit exact coordinates.
- Add client download helpers that fetch the ZIP as a blob and trigger a browser download.

## Error handling and security

- Require a web session for both routes.
- Return 404 for a record that is absent, unpublished, or blocked from the viewer.
- Return a useful 503-style error if an image cannot be read or the archive cannot be created.
- Do not modify the existing mobile routes or mobile UI.

## Testing

- Unit test archive manifest and GeoJSON generation, including coordinate order and relative image
  paths.
- API test that verifies authenticated access, block filtering, unpublished filtering, and image
  bytes in the downloaded ZIP.
- Web test that verifies the download helper requests the correct endpoint and starts a browser
  download.
- Run web typecheck, web tests, API tests, and the production web build.
