# Architecture
- Store validated SIGTAP monthly catalogs as atomic, competence-scoped snapshots; never combine procedure attributes and relationships from different months.
- Public consultation loads the latest validated Cloud snapshot through a public read-only server function and falls back to the bundled reference without claiming freshness.
- Only managed authenticated scheduled callbacks may import official archives; failed downloads or validation must preserve the last catalog and record a public, non-sensitive status.
- Parse official fixed-width table layouts from each archive, retaining all compatibility rows and their registration/type/quantity instead of deduplicating by code pair.