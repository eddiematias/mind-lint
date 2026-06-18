---
type: project
relationship: "<to-me role(s): lead | contributor | stakeholder | maintainer | advisor; may be multi-valued. NOTE: there is NO `owner` on projects. Project ownership lives on the parent Company (its `owner` to-me role) + the project's `belongs-to` edge, never duplicated here.>"
category: "<business | personal | mixed>"
status: "<active | dormant | archived>"
affiliations:
  - target: "[[Other Entity]]"   # a Person, Company, or Project this project points to
    role: "<edge vocab: belongs-to | works-at | collaborator | client | lead | owns>"
    category: "<business | personal | mixed>"   # nature of THIS edge, independent of me (R4)
    source: human                              # provenance; human now
    context: ""                                # source-span; human edges leave blank
---

# <Project Name>

## Snapshot

<!-- What it is + the goal. 1-3 sentences. Human-authored. -->

## Current focus

<!-- What's actively being worked on. Human-authored. -->

## Status

<!-- active | dormant | archived + a one-line why. -->
