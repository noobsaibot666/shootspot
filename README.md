# ShootSpot

A mobile-first, community-maintained location scouting library for photographers and filmmakers. Members capture a location in the field, attach a landscape or square image with practical scouting notes, and publish it so others can discover it. Other members browse nearby or chosen places and save locations into private projects for a shoot.

## Status

**Phase 0 complete (pending review): product decisions recorded.** No application code yet. Next: Phase 1, the technical proof (camera spike, NAS stack, repo scaffold).

Key V1 decisions: EU/UK launch with GDPR · sign-in required · **anonymous location records by default** (attribution is opt-in) · in-app viewing license only · 16:9 or 1:1 images · Feed · Map · Profile + Camera navigation · native maps per platform · follows system theme · NAS-backed prototype first. See [the decision record](docs/phase-0/01-decision-record.md).

## Documentation

- [Development plan](docs/production/location-scout-app-development-plan.md): product brief, architecture, and delivery phases
- [Design specifications](docs/production/location-scout-design-specifications.md): visual and interaction specification
- [Phase 0 decisions](docs/phase-0/): the decision record, scope, and backlog produced during discovery

## Planned structure

| Surface | Stack (proposed) |
|---|---|
| Mobile (iOS / Android) | React Native + TypeScript, native camera modules (Swift/AVFoundation, Kotlin/CameraX) |
| Admin web | Next.js + TypeScript |
| API | TypeScript (NestJS/Fastify), PostgreSQL + PostGIS |
| Media | S3-compatible object storage, processing worker, CDN |
