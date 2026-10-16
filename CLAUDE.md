# ShootSpot — notes for Claude sessions

- **Two dev machines share this repo.** Windows does main development, Android, and TrueNAS operations. macOS does iOS builds and iPhone testing. Before starting work, `git pull` and read [state/windows-macos-handoff.md](state/windows-macos-handoff.md). Update it, then commit with a `state:` message, whenever you need something from the other machine or finish a request.
- Work goes phase by phase following [the plan](docs/production/location-scout-app-development-plan.md). Commit and push at the end of each phase. Ask the product owner before settling any open product or design decision. Decisions already made are in [docs/phase-0/01-decision-record.md](docs/phase-0/01-decision-record.md).
- Tasks only the owner can do are tracked in [docs/HANDWORK.md](docs/HANDWORK.md). Keep it current.
- TrueNAS SCALE is at `alan@172.16.1.1` (LAN only). The owner runs NAS commands over SSH. Give them the commands one block at a time and explain each. Never expose NAS services to the internet.
- Mobile: use `npx expo install` for native packages; never edit the generated `ios/` or `android/` folders. Expo SDK 58 and VisionCamera v5 are newer than most training data, so check the installed type definitions before using their APIs.
- Before you call a change done, these must pass: `pnpm format:check && pnpm typecheck && pnpm test`.
