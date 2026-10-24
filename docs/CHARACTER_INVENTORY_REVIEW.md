# Character inventory and catalog identity

## Scope and durable context

Owner follow-up to published 0.9.3 (`6569e8890feb66acc608d12805ba94a04d0231f3`):
explain slow unequipping and waiting for each complete tooltip; display the tier
once; tolerate bounded OCR name errors including rn/m; equip only known cached
items. Unmatched reads stay in loose inventory with a red glow/yellow warning
and a fuzzy-match picker. Equipped physical copies leave the loose inventory
and return on unequip. The Character screen should resemble a dense MMO
inventory: identity/level/classes/AAs, dynamic stats, compact equipment icons on
the right, and hover/selection details. Remove Add to contributions from this
workspace. Preserve the independent contribution workflow.

Work branch: `codex/character-inventory-matching`. Published releases remain
immutable; target the next version. Standing owner release authorization applies
after source, native, platform/package and public-download verification.

Read these after compaction:

- `app/capture-workspace.js/css`: root owns the entire Character UI, intake,
  walkthrough guidance, matching integration and current editor/event wiring.
- `app/character-catalog.js`: local catalog search, canonical identity and bounded
  fuzzy proposals; catalog selection must preserve original observed evidence.
- `app/character-model.js`, `character-walkthrough.js`: physical copies, strict
  placement, saved state, original phase/time/session ownership and removals.
- `app/character-share.js`: current structured snapshot and PNG; preserve full
  metadata, separate AC/ATK components and honest unsupported formulas.
- `docs/CHARACTER_WALKTHROUGH.md`, `docs/design/CHARACTER_CAPTURE.md`,
  `docs/CHARACTER_CATALOG_BASE_RECOVERY.md`: existing state/math contracts.
- Read-only `C:/EverQuest Legends/uifiles/default_modern/EQUI_InventoryWindow.xml`
  gives the actual layout/stat component references. Never publish game files,
  player captures/profile data or newly copied game artwork. Reuse existing
  redistributable icons where available, otherwise use text/slot fallbacks.
- `scripts/test-character-walkthrough.mjs`, `scripts/test-capture-workspace.mjs`:
  native isolated fixtures currently assume unknown synthetic gear can equip;
  seed their known cases explicitly and add unmatched/fuzzy cases.
- `docs/RELEASE_HISTORY.md`: browsable new release screenshots, older media
  immutable, shared verified bootstrap and physical offline OCR package checks.

## Ownership and integration

| Owner | Files/work |
| --- | --- |
| root | UI/CSS, match picker/intake integration, plan/docs, release and packaging |
| character_model_089 | Catalog/model/walkthrough pure logic and their unit tests |
| capture_pipeline_089 | Read-only Modern layout/icons and independent review |
| wiki_contribution_089 | Two native Character/workspace fixtures after selectors agree |

Agree APIs/selectors before integration. No automatic catalog stat replacement,
fabricated icons, wiki writes or hidden deletion of physical copies. Exact
canonical matching can resolve tier-suffixed names; bounded close matches stay
reviewable and ambiguities require a choice. Preserve raw OCR spelling/evidence
and manual corrections even when the displayed identity becomes canonical.
The local pack can be incomplete: unmatched means absent from this cache.

## Acceptance

- Thornstinger/Thomstinger and the supplied Talisman spelling variants have
  bounded fuzzy choices. Confirming one retains observed stats/evidence/tier.
- Names in equipment, inventory and exported snapshots display the tier once.
- Unknown items cannot equip through auto-placement, menus, drag/drop, ANY
  confirmation or restored legacy equipment. Existing copies remain recoverable.
- Equipped/loose sets are disjoint; swapping/unequipping preserves card identity,
  distinct copies, model totals and saved layout across reload.
- Dense icon layout, usable mouse and keyboard actions, visible unmatched
  warning, stat tooltips, live metadata/AA/stats, no contribution shortcut.
- Real native screenshots at compact size and large fonts; no clipped controls,
  inaccessible hover-only actions or unexpected scroll/focus jumps during OCR.
- Full source checks, exact-head Windows/Linux packages and release verification
  before reporting live. Installed player profile remains untouched by tests.

## Progress

Implementation and independent source review are complete for 0.9.4. Unit and
isolated native walkthrough checks pass, including legacy unknown equipment,
fuzzy ambiguity, physical cards, saved metadata and 20px layout. The screenshots
are reviewed and archived. The full source suite, dependency audit and full-app
native workspace check also pass, including offline imports/sharing and
loopback reviewed wiki retries. Exact-head CI/package and public-download checks
remain required; no new publication is claimed yet. Record their exact IDs in
the release PR and private publication ledger instead of another main push.
