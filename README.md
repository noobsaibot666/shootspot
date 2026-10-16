# ShootSpot

A mobile-first, community-maintained location scouting library for photographers and filmmakers. Members capture a location in the field, attach a landscape or square image with practical scouting notes, and publish it so others can discover it. Other members browse nearby or chosen places and save locations into private projects for a shoot.

## Status

**Phase 0: product decisions and discovery.** No application code yet.

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
