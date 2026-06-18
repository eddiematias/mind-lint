# Entity Model + Relationship Taxonomy (Phase 2)

Mind-Lint models three entity types as markdown files under `wiki/`:

- **Person**: `wiki/people/<Name>.md`
- **Company**: `wiki/companies/<Name>.md`
- **Project**: `wiki/projects/<Name>.md`

Each has a shared frontmatter header and a typed, many-to-many `affiliations` edge list.
Templates: `templates/people-profile.md`, `templates/company.md`, `templates/project.md`.

## Shared frontmatter header

- `type:` person | company | project
- `relationship:` the **to-me** role(s) (how this entity relates to Eddie). May be multi-valued.
- `category:` business | personal | mixed: the single explicit to-me rollup.
- `status:` active | dormant | archived (Person also allows `seeded` = file exists, human-authored sections empty).
- `affiliations:` the typed edges (below).

## The `affiliations` edge list

A nested list of objects. Each edge:

- `target:` `"[[Entity Name]]"` (quoted wikilink to another Person/Company/Project).
- `role:` the tie, from the **edge vocabulary** below.
- `category:` business | personal | mixed: **the nature of THIS edge between the two endpoints, independent of Eddie** (R4). Distinct from the top-level `category` (the entity's to-me rollup).
- `source:` `human` now. Reserved for Phase 3 derivation: `derived` + `confidence:` (discrete buckets) + `from:` `"[[citation]]"`.
- `context:` optional short source-span. Human edges leave it blank; derived edges fill it.

**Many-to-many, one-way, write-once:** write each edge once on whichever entity is natural. No mandatory mirroring. Reverse traversal ("every project X is on") is the deferred computed-graph layer; single-sided edges are its input. Today the brain surfaces both sides via semantic recall (Task 1 serializes affiliations into searchable chunk text).

## Two distinct vocabularies (R6: do not collapse the owned/owner homonym)

These look related but are NOT the same set. The to-me `relationship` describes how an entity
relates to Eddie; the edge `role` describes how two entities relate to each other.

**To-me vocab** (`relationship:`) is **TYPE-SPECIFIC**: each entity type draws from its own set.

- **person:** girlfriend, family, friend, co-worker, collaborator, client.
- **company:** employer, client, owner, vendor, collaborator, side-project.
- **project:** lead, contributor, stakeholder, maintainer, advisor. **There is NO `owner` on projects.** Project ownership is expressed via the `owner` relationship on the parent Company plus the project's `belongs-to` edge, never duplicated onto the project.

**Edge vocab** (`role:`, shared across all edges): works-at, founded, co-founder, employer, client, collaborator, belongs-to, owns, friend, family, vendor, lead, president, acquired, parent-company, subsidiary.

Both are **open** (the model may add terms) but **seeded** (human + future-derived edges should normalize to these so they compose). When adding a new term, prefer an existing synonym before coining a new one.

## Eddie is implicit

There is no `[[Eddie]]` self-node. The top-level `relationship`/`category` encode "how this relates to me." Edges between two non-Eddie entities are first-class and common (e.g. `[[Jeff Perera]]` → founded → `[[JBR]]`, person→company; `[[Jeff Perera]]` ↔ co-founder ↔ `[[Danielle Perera]]`, person→person). A project→project edge is also supported by the schema (a project can `belongs-to` another project), though the current active graph has no instance of one.

## Obsidian / viewing

- Simple props (`type`/`relationship`/`category`/`status`) render as Properties pills; `[[wikilinks]]` in prose feed the native graph.
- The nested `affiliations` list does NOT render in Obsidian's Properties editor and the native graph won't follow wikilinks nested in objects. View the structured edges via **Dataview** (primary for nested arrays) and/or **Bases** as it matures (not interchangeable, R6). Quoted `[[wikilink]]` targets render as plain text in Dataview tables (re-linkable in-query).

### Dataview: list entities, and explode the edges (the CRM view, job #2)

A simple entity table (top-level props only):

```dataview
TABLE relationship, category, status FROM "wiki/companies" OR "wiki/projects" WHERE type
```

To get an affiliation/CRM view (one row per EDGE rather than per entity), use `FLATTEN` the nested `affiliations` list:

```dataview
TABLE
  affiliations.target AS "Target",
  affiliations.role AS "Role",
  affiliations.category AS "Edge category",
  affiliations.source AS "Source"
FROM "wiki/people" OR "wiki/companies" OR "wiki/projects"
FLATTEN affiliations
WHERE type AND affiliations
```

> **Honest caveat:** `FLATTEN affiliations` gives the one-row-per-edge shape that serves job #2 (operational CRM), but it is not a finished CRM. It needs query work beyond the schema to be genuinely useful (e.g. filtering by `affiliations.role` / `affiliations.category`, reverse views ("everyone affiliated with [[JBR]]") which require querying every file's edges since edges are write-once one-way, and the computed reverse-graph is deferred as Phase-3/item-6, and `affiliations.target` rendering as plain text rather than a clickable link (re-link in-query if needed)). The schema supports all of this; the polished views are follow-on Dataview/Bases work, not part of this plan.
