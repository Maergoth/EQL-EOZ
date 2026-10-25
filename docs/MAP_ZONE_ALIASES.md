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

An alias match does not prove that the selected game folder contains its archive,
maps, textures or dependencies. Missing archives and failed decodes remain
reported separately. These source tests use synthetic archive inventories and
do not validate proprietary geometry, artwork, route quality or a live game.
