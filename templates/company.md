---
type: company
relationship: "<to-me role(s): owner | employer | client | vendor | collaborator | side-project; may be multi-valued e.g. [owner, employer]>"
category: "<business | personal | mixed>"
status: "<active | dormant | archived>"
affiliations:
  - target: "[[Other Entity]]"   # a Person, Company, or Project this company points to
    role: "<edge vocab: founded | owns | acquired | parent-company | subsidiary | client | vendor | collaborator | lead | president>"
    category: "<business | personal | mixed>"   # nature of THIS edge, independent of me (R4)
    source: human                              # provenance; human now. Phase 3 adds: derived + confidence + from
    context: ""                                # source-span; human edges leave blank
---

# <Company Name>

## Snapshot

<!-- What it is + my relationship to it. 1-3 sentences. Human-authored. -->

## Context / Status

<!-- Current state, what's happening now. Link out to working context if any
     (e.g. JBR → context/clients/jbr/). No emotional sections. -->
