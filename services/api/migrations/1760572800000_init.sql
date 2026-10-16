-- Up Migration
-- Foundation only. The domain schema (locations, media, record_ownership, projects, ...)
-- arrives in Phase 2; see docs/phase-0/03-rights-privacy-data-ownership.md §5.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Down Migration
DROP EXTENSION IF EXISTS postgis;
