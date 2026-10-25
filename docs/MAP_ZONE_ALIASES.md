# Zone identities and local maps

Map Explorer, native 3D Map and the 2D map loader retain a verified `/who` short
name. They check the complete zone catalog before selecting an archive. Exact
archive IDs win over display labels and file-folder preference. An unknown or
conflicting short name cannot select another zone or reuse its ready state.

Four catalog labels have more than one supported archive ID. Their optional
`viewerId` is the reviewed default when a zone-enter line provides only a display
name:

| Zone | Preferred ID | Other supported ID |
| --- | --- | --- |
| Plane of Sky | `airplane` | `sky` |
| North Ro | `nro` | `northro` |
| West Karana | `qey2hh1` | `westkarana` |
| South Ro | `sro` | `southro` |

The pinned viewer also documents seven exact client filename equivalences:
`kerra`/`kerraridge`, `sky`/`airplane`, `oot`/`oceanoftears`,
`newsebilis`/`newsebexp`, `westkarana`/`qey2hh1`, `northro`/`nro`, and
`southro`/`sro`. If the exact requested archive exists, it takes precedence;
otherwise only its documented equivalent is eligible. The 2D loader uses the
same groups. General partial matching never establishes an archive equivalence.

New public zones without curated viewer metadata use their one unambiguous
literal `/who` alias as the archive target. The viewer checks only that exact
local S3D/EQG candidate before adding it to the selector. A bounded PFS filename
preflight precedes the existing header worker. Older EQGs can instead use a
validated exact `<id>.zon` layout file: its supported header, counts, strings and
terrain reference must agree with the archive. The layout file is also included
in the ordinary decoder inputs. Lazy native file handles are materialized for
those requested files only; the complete game-folder inventory is never decoded or uploaded. The
ordinary guarded loader still has to decode the zone successfully before it
is ready. Source changes and newer requests reject late identification results.
Nektropos Castle (`nektropos`) and Nektropos Undercrofts (`nektrunder`) follow
this generic path in both Map Explorer and the native 3D Map. A similar name,
unverified alias or object-only archive does not establish a playable zone.
Alias collisions are refused for display-name, short-name and `/who` lookups.
At most eight identification requests may be active or queued; settled work
cannot permanently exhaust that limit.
Each active identification, including native file reads, has a 15-second budget.
Queued requests wait for the preceding active request; changing folders retires
that queue so old work cannot hold up the newly selected source.

The decoder sometimes emits GLTF image placeholders with neither a URI nor a
buffer view. `viewer-gltf-images.js` removes only material texture bindings to
those unavailable images before Three loads the scene. Binary geometry, valid
images and material colors remain exact; the existing raw local texture lookup
can still supply the original artwork. No replacement artwork is generated.

Classic EQG terrain buckets can exceed 65,535 vertices before the pinned
exporter's next material split. `viewer-terrain-indices.js` preserves its winding
and chooses Uint32 indices only when required. The checked, idempotent
`scripts/patch-viewer-terrain-indices.mjs` installs this single terrain seam;
other model/decoder paths and pinned vendor files are unchanged. The decoded
zone cache gets a separate revision so previously wrapped geometry is rebuilt.

`freportw` is West Freeport, `freporte` is East Freeport and `freportn` is North
Freeport. They remain separate. The native Map partition permits the two exact
bundled shared-scaling JavaScript paths imported by its chrome; blocking those
imports prevented the Map renderer from mounting before zone selection.

Run `node tests/map-zone-aliases.mjs` after building the bundled viewer. It reads
the actual pinned viewer name/filename registries and the reviewed producer
catalog, checks every supported alias for collisions, exercises `/who` parsing,
and runs the actual cross-zone `loadZone` wrapper. It also verifies alternate
filename-only inventories, 2D file selection and unknown/conflicting identities.
Keep the wiki catalog, desktop source mirror and schema aligned.
`node tests/viewer-archive-discovery.mjs` covers new public-zone targets and the
actual wrapper's targeted discovery, refusal and stale-request behavior.
It also exercises bounded PFS expansion and exact loose-zone layout files.
`node tests/viewer-gltf-images.mjs` verifies that only unavailable bindings are
removed and that the geometry bytes and valid texture bindings are unchanged.
`node tests/viewer-terrain-indices.mjs` executes the actual patched worker
function at the 65,535/65,536 boundary and at 70,002 vertices, and verifies winding,
unchanged small-index bytes and cache revision isolation.

An alias match does not prove that the selected game folder contains its archive,
maps, textures or dependencies. Missing archives and failed decodes remain
reported separately. These source tests use synthetic archive inventories and
do not validate proprietary geometry, artwork, route quality or a live game.
