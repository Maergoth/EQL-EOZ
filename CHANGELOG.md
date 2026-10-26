# Changelog

## 1.0.6 - Expandable private inventories

- Store full desktop inventories in a private database with no aggregate item-count or inventory-byte limit. Search and browse carried gear, bank, depot, keyring and unmatched exports in pages.
- Stream inventory exports and commit them together with achievements. Failed or canceled imports preserve the saved character; item copies, sockets, manual changes and recorded stats keep their meaning.
- Migrate existing characters with a verified recovery backup. Save changed records without rewriting the entire inventory or mirroring it to browser storage. Wiki sharing continues to use equipped gear and reviewed totals.
- Scale an item's listed base Void resist with the same formula as other resists. Preserve explicit zero and unknown bases, and retain conditional rank-based Void when the base field is absent.

## 1.0.5 - Cleaner chat discoveries

- Keep trade captions containing one or several known items out of automatic new-item suggestions. Whole catalog titles and aliases retain their exact identity; genuine new encoded item links remain supported.
- Reversibly archive untouched old chat captions when exact sequential catalog names cover at least half their words and a separate trade cue identifies the surrounding prose, including unranked captions.
- Preserve edited, reviewed, screenshot-backed, loot and source-bearing drafts. A full archive keeps the raw record quiet without discarding its evidence.

## 1.0.4 - Character achievement exports

- Run `/outputfile inventory` and `/outputfile achievements`, then import both current-character files with one button. Missing files open a native chooser; malformed or canceled imports preserve the saved character.
- Save achievement categories, explicit completion, objectives and progress counters per character across sessions.
- Review and share achievements in a collapsible section below the character's equipment and recorded stats. Existing sheets remain compatible, with wiki renderer support checked before publishing achievements.

## 1.0.3 - Character Exaltation effects

- Show Exaltations as their name and effects, including Focus effects and Worn labels, without repeating equipment stats or restrictions.
- Refresh saved Exaltation effects from exact matches in the updated local wiki dataset. Keep item tiers, socket values and recorded character totals unchanged.
- Keep newly shared wiki Exaltations compact, with canonical links and effect metadata. Existing private numeric data stays available inside Character.

## 1.0.2 - Personal depot inventory imports

- Accept `Personal-DepotN` storage locations in `/outputfile inventory` exports instead of stopping the entire import at the first depot entry.
- Preserve depot item counts, tiers, locations and physical copies across reimport and restart. Depot contents remain unequipped; container contents and attached Exaltations retain their existing roles.

## 1.0.1 - Stable discoveries, combat and maps

- Match canonical item names within flattened chat instead of treating quoted sales prose as a new item. Genuine encoded item links retain their exact boundaries.
- Keep Discovery rows, filter controls, scroll position and the selected draft stable during background updates and verification renewal. Previously unseen gaps still require live confirmation; publishing still requires fresh proof.
- Reversibly archive proven untouched old chat-caption suggestions while preserving reviewed, edited, OCR-supported, loot and source-bearing work.
- Generate item stat blocks in the wiki blueprint format, including canonical Atk Delay and WT labels, without inventing missing item values or flags.
- Keep map-selection controls and their options readable against the application's dark background.
- Attribute heal-over-time ticks and critical heals to their logged healer, and remove repetitive explanations below the Parse tables.
- Count measured short heals, damage-shield retaliation, unnamed-caster DoT damage and nearby reave/smite attacks while retaining unknown sources and separate pet names.
- Match a first unnamed DoT tick to the earliest pending cast of that exact spell. Explicit caster names take priority; unavailable or conflicting context remains unknown.
- Restore Nektropos Castle and Undercrofts in both 3D map views, including their local support files and Castle's large terrain mesh.
- Import bag contents separately from attached Exaltations, preserve genuine item sockets and keep loose Exaltations out of equipped gear.

## 1.0.0 - Eye of Zomm 1.0

- Use the native eye icon on desktop shortcuts, installers and application windows.
- Deliver changed logged locations promptly to the minimap, restore visible-map polling and catch up through busy logs in bounded bursts. Old source and zone coordinates cannot return after a reset.
- Share Crawl between Map and Zone & loot. Fresh kills clear matching located or loot-bearing mobs until the next zone visit; turning Crawl off restores normal previews.
- Compare logged combatants in whole-session and encounter Overview, with per-combatant Damage, Healing and Taken details. Track AA Gained in Session. Live retains the last completed fight until another begins.
- Use explicit wiki Backstab, Delay and Damage Bonus fields in item previews. Preserve independent base values and exact decimal weight rounding; Torturer's Signature at tier 8 has Backstab 21 and weight 0.7 from its documented bases.
- Follow New Item Found! from a log-backed popup to the exact contribution and examine prompt. Optional OCR fills one structured numeric form; blank fields stay omitted and invalid edits stay recoverable.
- Respect one persisted Screen Reading setting across all capture and OCR paths. When enabled, the active Contribute discoveries tab starts its reader automatically; unchecked disables capture while ordinary logs continue.
- Match destination pages automatically, retain an already verified editor during proof refresh, and keep Preview or publication gated on fresh missing-fact proof. Permanent ignore sits to the right of dismiss.
- Respect item-link boundaries so preceding chat prose does not become part of an item name. Preserve authentic unknown links while keeping ambiguous unmarked prose quiet.
- Recover bounded transient Windows settings-file replacement failures without deleting the prior destination or masking terminal errors.

See [the 1.0 release record](docs/RELEASE_1_0_PLAN.md).

## 0.9.15 - Verified discoveries, zones and map controls

- Check the public live wiki before showing an automatic discovery, item gap or monster popup. Use the bundled snapshot to avoid checks for known facts. Keep pending, failed, broad, unsupported and inconclusive checks out of the discovery queue and popups; recheck current facts before publication.
- Reuse temporarily cached public wiki entries, including their direct zone and loot data, until the shipped snapshot reaches that revision. Share the cache across item presence, gap verification and local views; expire absence verdicts quickly and refresh old source proof without treating temporary facts as global loot-count completeness.
- Dismiss an individual discovery with its red ×, or use ∞× to ignore that exact NPC or item across future contribution attempts. Restore ignored entities from Contribution History, including while signed out. Device ignores persist across restarts and dataset updates; existing submission receipts remain available.
- Preserve readable zone names from entry logs and self /who records, including Lake Nerius. Export canonical public zones beyond the curated map catalog and retain documented NPC zone/category facts. Empty cache metadata no longer proves a wiki gap.
- Recover explicit numeric /con levels from the selected log and the same continuous zone visit. Prefill killed-monster levels as unconfirmed observations with provenance. Considering a monster alone creates no discovery; zone/source/instance changes and older contributor edits are respected.
- Create zones from the shared live Zone blueprint with an opening overview and Map, explicit Yes/No/Unknown raid availability, and separate optional raid overview and Raid Map. Validate reviewed map images and keep placeholders when unknown; narrow updates preserve existing zone content.
- Restore scoped global loot-count completeness by bounding reviewed unresolved groups without expanding their broad entries or manufacturing drop counts. Research materials remain uncertain; verified important loot can qualify as Unique under the existing six-monster rule.
- Keep the 3D player marker visible at full-zone scale, show a movement-derived direction arrow, and make left-drag pan in the top 3D view. Retain explicit rotation controls for the perspective view.
- Use an eye mark in the app header and browser icon, styled for the existing dark and gold interface.

## 0.9.14 - Contribution history and safer loot discovery

- Skip routine automatic source backfill for known common materials only when cached records positively prove weight-only, unequippable metadata and at least six existing monster sources. Keep unknown entities, gear, effects, uncommon drops, incomplete metadata and manual contribution drafts available; no item-name exceptions or live material lookups are added.
- Ask `Is <monster> notable?` in the new-monster popup. Save explicit Yes/No choices for the exact draft without moving game focus; preserve unanswered location drafts and expose the choice in Contribute. Stale popup choices cannot replace edited or already reviewed/published work.
- Bring Discoveries and Contribution History into one Contribute section with shared account controls. Compact the reader toolbar and replace the repeated three-receipt feed with one latest-result summary linking to History. Preserve draft edits, visible failure reasons and reader ownership when switching tabs.
- Make Pause reading stop the Contribute-owned reader even with a pending item request or late start. Refresh or view re-entry cannot restart it; explicit Start or Contribute can resume using the selected source. Log processing continues separately.
- Add **Any** immediately before **Auto** in Items. It disables only the Items class filter and preserves the detected/profile classes used elsewhere.
- Recognize complete documented item-set membership in authored monster and zone loot sections, scoped to the instance. Preserve the listed set and its loot kind; fill missing individual item-page sources without appending redundant members. Native reviewed and saved-plan guards enforce the same coverage rule.
- Standardize rich item previews on a 350 ms mouseover delay across the main app, Character and Intel. Keep keyboard access immediate and cancel pending previews on leave, scroll or source/view changes.
- Avoid Intel row layout work on unrelated session updates and patch distance labels in place. Preserve its scrolling DOM and scroll position; retain anchor/focus recovery when displayed content changes.
- Restore native Map startup by admitting its two bundled shared-scaling scripts through the existing local request policy. Other vendor files, provenance JSON and private APIs stay unavailable to that window.
- Show missing-wiki suggestions in a dedicated lower-right desktop popup, independent of Timers and without activating the main window. Preserve stacked cards, visible-time expiry, hover/focus holds and explicit Contribute/Ignore actions; only Contribute starts its reader workflow.
- Check cached item membership before a bounded, coalesced public page-existence lookup. Suppress existing pages and unverified failures; cancel stale source/profile lookups before they can open a popup. Timers has no discovery-action IPC bridge.
- Add **Contribute → History** with automatic and reviewed submission receipts, partial and unconfirmed outcomes, local filters, older receipts, and saved-page/revision/diff links. Load only the current wiki account's receipts; switching accounts or logging out clears displayed rows. History cannot publish or retry work.
- Retain bounded native receipt metadata independently of editable plans. Preserve unreadable history, keep evidence and credentials out of the receipt file, and report history-storage failures without changing a confirmed wiki edit result.
- Exclude explicit owner-labelled pets from new monster discoveries and contribution plans, including stale catalog matches, while preserving literal monster names that merely contain similar letters. Existing edited and submitted work stays available.
- Classify new loot placement from distinct monsters across the trusted cached wiki dataset. Six or more means Common; fewer means Unique only with complete count provenance. Missing or incomplete counts require refreshed data/review and never silently default to Unique. Count lookup makes no live wiki requests; ordinary publication/account/revision guards remain.
- Retain the existing weight formula and cover the rank-ten display boundary: base weight 2.5 displays as 0.3.
- Bundle corrected shared rules revision 2: positive primary stats above ten use the floored rank gain, matching HP 50 → 75 at rank 5 with 4/32 progress and AC 14 → 22 at rank 6 with 5/64 progress. Reverse recovery uses the same engine; older saved recovery reviews require review under the new rules. Negative penalties retain their existing rounding.
- Include AC, HP, Mana, Endurance and their three regeneration fields in the shared Void eligibility whitelist. Two distinct qualifying base fields still earn one Void per rank; weapon damage, Backstab, Haste and Attack do not qualify.

See [the release record](docs/RELEASE_0914_PLAN.md),
[history contract](docs/CONTRIBUTION_HISTORY.md), and
[cached loot-classification contract](docs/CONTRIBUTION_LOOT_CLASSIFICATION.md).

## 0.9.13 - Correct tier-zero verification category

- Use the exact [Tier 0 Verification Needed](https://eqlwiki.com/Category:Tier_0_Verification_Needed) category title for new items with unverified ranked or recovered base values.
- Recognize app-marked category membership in either capitalization when an accepted tier-zero reading clears it; preserve manually assigned categories.

## 0.9.12 - Shared wiki item formulas and tier-zero verification

- Use one wiki-owned item calculation engine and revisioned rules for item-tier previews. Match wiki Backstab, weapon Accuracy, Void resist, weight and tier limits; recorded Character totals remain unchanged.
- Resolve the wiki source once when preparing a release and give Windows and Linux the same formula snapshot. Installed apps keep their bundled formulas until the next app update, with no runtime formula polling or API requests.
- Add new item pages created from unverified ranked or recovered bases to [Category:Tier 0 verification needed](https://eqlwiki.com/Category:Tier_0_verification_needed), retaining the tier-zero verification note.

## 0.9.11 - Automatic contribution reading and chat item detection

- Start gentle local screen reading when Contribute opens, using the configured or unique game window or offering an inline source choice. Prompt users to open the selected item and keep Pause/Retry available. Preserve Character and preexisting readers; stop only the reader started for this view when it is no longer needed.
- Fill unedited item proposals from fresh matching examine readings. Stage a reliable cropped screenshot from the exact accepted frame and suggest local icon matches when a Default Modern icon crop is available. Preserve manual fields and existing images.
- Recognize conservative tier-decorated item mentions when EverQuest strips chat link codes from logs. Label these as possible items and retain catalog checks, duplicate suppression and local-only evidence.
- Automatically create eligible new item pages from fresh matching native examine evidence after live exact, redirect and near-duplicate checks. Retain account attribution, create-only/retry guards and tier-zero notes; ambiguous readings and unrelated edits stay in the normal review. Link successful creations to their pages.
- Append logged drop sources automatically while preserving prior item/mob/zone sources, stats and prose. Resolve canonical/redirect/unique confident fuzzy titles; correlate inferred loot with a witnessed recent same-zone kill. Ambiguous/conflicting updates remain for review. Actual native log reads authorize writes; initial replay and renderer-proposed records cannot. Relation-specific receipts allow later mobs to add sources.

See [the implementation and release record](docs/CHAT_CAPTURE_FOLLOWUP_PLAN.md).

## 0.9.10 - Reliable overlays and streamlined wiki contributions

- Gently drag a snapped overlay to detach it without resizing it or moving its neighbors. Dock only when released within eight pixels of a new panel; the detached group cannot pull it back during that drag. Resize grips remain clear of drag surfaces.
- Use the same wiki-style item frame, inline stats and linked effects throughout Character, item/NPC/loot/Live Map and native Intel hovers. Keep the equipped tier slider, green changed values, compact Exaltation name/effect and recorded-only Character totals. Share the reviewed Character sheet with one Share action.
- Give the minimap a movement-direction arrow based on successive logged locations, retain it while stationary and reset it on zone/source changes or large jumps. Native map opacity now applies to its two-dimensional canvas and complete three-dimensional surface.
- Open item contributions with screenshot and inline icon paste together. Use Classes and Equipment slots multiselects, one Zone field, fewer approval steps, explicit destinations and saved-page links. Empty item fields stay blank; selected effects survive old unknown text. Later monster creation can recover published item-source relationships into its reviewed loot list.
- Prefill editable compatible base-stat proposals from a tiered examine reading and include them in the preview without another Apply step. Preserve the observed evidence and valid manual edits, retain the tier-zero verification note and reject ambiguous missing weight decimals. Missing base SV Void starts at editable zero.
- Restrict automatic monster discoveries to kill/death evidence and named-corpse loot sources; nearby casts, considers, players and recognized pets do not become new-monster submissions. Show the triggering log line locally, distinguish exact page matches and explain each proposed addition's destination. Preserve edited or partly published drafts during cleanup.
- Detect encoded item links in live chat and offer Contribute for missing wiki items without inventing a loot source. After Contribute, keep the notice pinned until a fresh matching live examine reading is saved; show green completion before closing. Inline source choice preserves Character capture and existing readers.
- Keep an accepted monster contribution waiting for the newly armed next `/loc` until capture or dismissal. Match only fresh evidence from the active request, handle resize/calibration/resume generations and offer retry after capture errors. Stop only the reader started for the completed or dismissed requests.

See [the execution and release record](docs/RELEASE_0910_PLAN.md). App publication
does not install separate wiki code, database templates or schema changes.

## 0.9.9 - Clearer wiki gap reviews and Character controls

- Browse discovery gaps with New Page / Update Page tags and independent category filters. New monsters and items appear before smaller updates.
- Choose an existing page from deduplicated vertical cards. Case-forgiving canonical matching and decorated Exaltation/container identities prevent false gaps while real page collisions still need review.
- Review specific additions on existing pages instead of the full creation form. Drop-source reviews update item, monster and compatible zone lists together, preserving page formatting and revision guards.
- Use a numeric item-tier slider with immediately matching equipment badges. A 350 ms hover pause prevents accidental popups; Exaltations use compact name summaries.

See [the execution and release record](docs/RELEASE_099_PLAN.md).

## 0.9.8 - Richer Character cards and reviewed wiki contributions

App publication, wiki schema/templates/API documentation activation and installed-list
cleanup have separate acceptance records in [the release plan](docs/RELEASE_098_PLAN.md).

- Put the equipped item's tier slider directly below its hover name. Keep adjusted preview values green and recorded Character totals unchanged.
- Prefill known attached `(Exaltation)` export rows using an exact socket-only alias. Default unknown capacity to five sockets while preserving explicit observed capacity and occupied positions through eight; retain original artwork and private export provenance.
- Reuse bounded rich item details across Character cards, inspect/share and compatible main/overlay tooltips, including real procs, focus effects, cast times and required levels. Thornstinger retains Rampage without adding any item values to recorded totals.
- Share new interactive Character (Server) sheets to the authenticated account's User page. Preserve other characters/content and existing talk-page sheets; destination changes and old retries need a fresh review.
- Reconcile contribution identities through one exact typed resolver. Keep missing-source/population and tier-zero tasks on existing pages, archive safe obsolete false positives, preserve edited/partial work and suppress generated pets unless the wiki positively identifies an NPC.
- Arm one fresh unknown-kill spawn `/loc` request immediately without stealing game focus. Newer kills replace the active target; source/zone/timeout guards and explicit rearming preserve the correct draft.
- Lead the editor with match/task review, readable optional fields, Classic/Normal defaults, Raid Instance, Common/Unique Loot rows and a final multi-page diff. Preserve background edits, reviewed existing-page patches, partial retry and contributor attribution.
- Add a screenshot select/paste area and a local Icon Finder that reuses the wiki's algorithm, lazy versioned index and exact artwork aliases. Cropped icon pixels stay local; screenshot publication remains explicit.
- Simplify tiered base recovery while preserving rounded uncertainty and a visible tier-zero verification warning. Missing item effects can include a spell-blueprint page in the same reviewed plan.
- Store minimal fresh kill/loot observations in a separate bounded atomic outbox, including known entities. Send due batches at most hourly while running and logged in, with stable IDs, account-bound acknowledgements, offline retention, backoff and a Settings opt-out; this archive does not calculate drop probabilities or publish articles.
- Link the reusable attributed MediaWiki create/edit/upload and versioned observation contracts from the public API documentation. Wiki code, database pages and schema require separate activation; no dataset refresh is part of this release.

## 0.9.7 - Import equipped inventory and record observed stats

- Replace the unreleased baseline-retry flow with character details → fresh `/outputfile inventory` auto-import → equipped, unbuffed stat review → save/share. Keep all gear equipped throughout; EoZ never sends the game command.
- Read the selected character's bounded inventory file from the chosen game folder, with an explicit file chooser fallback. Preserve physical duplicates and worn locations; bags, bank and keyring entries cannot become equipment. Invalid/stale imports leave saved data intact.
- Put **Open your Inventory**, **Scroll down** and **Click off your buffs** directly in the stat step. Optional Default Modern screen reading uses a lower 1 FPS cadence and retains source/session/generation and freshness guards.
- Use only the reviewed current stat reading for totals, with maximum resources, distinct AC/ATK components and ten Additional Modifiers. Never add item, augment, catalog or old baseline values to character totals. Character item OCR is retired; examine reads support Contribute.
- Leave unknown wiki items/augments out of public equipment and sockets. Supply missing details through reviewed contributions, sync the wiki and export inventory again. Clear inventory resets only the selected character's imported gear and invalidated stats.
- Retain the bounded encoder watchdog, recoverable source status and private persistence. Updated native/Windows/Linux/package acceptance is required before release; earlier synthetic or live diagnostics do not certify this flow.

- Collect persistent unknown item, monster and zone drafts directly from logs with linked source/population/loot evidence, exact item deduplication, guarded spawn `/loc` requests, direct screenshot reading and visual icon selection in Contribute. Reviewed zone/NPC blueprints retain confirmed relationships.

## 0.9.6 - Inspect your character and share it on the wiki

- Show one compact character total panel with maximum HP, mana and endurance, and distinct AC/attack components. Keep the same totals in the local PNG and interactive share review.
- Click empty equipment slots to open Add item with focused, slot-compatible wiki search, a tier slider, and explicit clipboard/file screenshot reading. Unknown reads stay in Inventory for matching.
- Click item augment sockets to select a known item and tier, including weapons in armor. Read explicit socket counts, preserve original examine values and apply augment changes once. Keep Exaltations as effects.
- Remove fractional progress controls and the Power Source equipment slot. Preserve old Power Source cards in Inventory and keep captured statistics intact.
- Share a collapsed, interactive Character (Server) sheet on your own wiki talk page. Gear and augments link to their articles; resharing replaces the matching managed sheet while preserving other characters and discussion. Check installed wiki templates/renderer before editing, protect revisions and reconcile uncertain retries without duplicate sections or PNG uploads.
- Rebase fresh item reads to their observed augment layout without double counting; preserve offline projections and protected manual values. Reject late screenshot actions after switching characters or closing a picker, and keep wiki behavior-switch text literal.

## 0.9.5 - Keep your inventory and recover missed item reads

- Select saved characters as Character (Server), with separate inventory, equipment, baseline and walkthrough progress. Entries appear after the first validated step; switching stops Character capture without automatically restarting it.
- Keep selected-item tier and progress controls visible outside the advanced editor. Label wiki-based previews, color adjusted values green and retain original captured statistics.
- Persist Character inventory, equipment and walkthrough state in private app storage across restarts, upgrades and fallback local ports.
- Reuse one automatic item card across capture sessions and changing tiers; add extra physical copies manually and choose which saved copy to update when ambiguous.
- Unequip with the equipped item’s X or by dragging it back to Inventory. Add item opens and focuses wiki search immediately without creating a blank card.
- Add two universal Any slots. Highlight valid drag targets and reject incompatible normal placements, including legacy restores.
- Fix later item reads being suppressed by earlier removals. Block stale/held tooltip results while allowing a fresh capture pass or explicit Rescan removed items to recover the item.


## 0.9.4 - A compact Character inventory with wiki matching

- Use a compact icon inventory with identity, level, classes, AA count and live equipped estimates beside all 23 equipment slots. Hover or select an item for its stat block.
- Show each tier once. Resolve unique bounded OCR spelling errors against the cached wiki catalog; exact names take priority and ambiguous matches need your choice. Keep original observed text and stats.
- Keep unmatched reads in loose inventory with a red glow and yellow warning until you choose a wiki match. Only known items can equip, including restored snapshots.
- Equipped physical items leave loose inventory and return on unequip. Separate copies, manual corrections and original evidence remain intact.
- Unequip slowly, one item at a time, keeping the complete Default Modern tooltip visible until its card appears. Reading continues through review; No Equipment still requires a fresh baseline.

## 0.9.3 - Keep reading items through Character review

- Continue item capture during Confirm slots and Save snapshot until walkthrough completion or cancellation. Keep fresh No Equipment baseline and source/session/generation checks.
- Recover repeated observations from the active walkthrough into one physical item card, retaining evidence, manual edits and explicit copy/removal choices.
- Automatically locate Default Modern tooltip panes, crop and enlarge them before offline OCR, and prioritize distinct tooltip pixels over animated scenery. Keep bounded temporary queues, periodic full-scene fallback and manually calibrated areas.
- Keep acquiring bounded snapshots while a previous full-resolution screenshot is being encoded, preserving short tooltip frames and their original timestamps. Derive detection, fingerprints and OCR pixels from one frozen frame to prevent mixed-frame duplicate suppression.
- Encode screenshots in one local browser worker so renderer idle scheduling cannot stall the tooltip queue. Keep original capture times and source checks; report encoding failures visibly.
- Preserve compact tooltip name and stat rereads when Inventory is also visible; retain editable OCR uncertainty.

## 0.9.2 - Capture brief item tooltips

- Recognize compact Default Modern hover tooltips as well as full examine panes, including single-word item names, bare equipment slots and separate stat columns.
- Sample screen changes more frequently and retain a bounded queue of distinct frames while the offline OCR worker is busy. Keep temporary pixels in memory and report queue saturation.
- Retain an item captured during unequip/re-equip if OCR completes after advancing the walkthrough. Keep No Equipment baseline freshness and source/session guards; an earlier manual import cannot become a fresh baseline after navigating Back.
- Show reading progress in the walkthrough; wait for the item card before moving to the next item when the reader is catching up.

## 0.9.1 - Guided character capture and touching overlays

- Build Character snapshots through one saved walkthrough: character details and AA count, inline game-window selection, unequip/examine, fresh No Equipment review, re-equip, ANY-slot confirmation and preview/save.
- Place obvious equipment automatically, retain separate physical copies, defer uncertain tier/copy matches and add a top-right inventory remove button. Catalog search and offline screenshot imports remain available.
- Compute equipped estimates from the reviewed baseline and assigned gear, without requiring an equipped-stat capture. Label mitigation AC, AC softcap, evasion AC, offense and accuracy separately; unsupported server conversions stay unknown.
- Retain the bounded written item stat block for correction and reparse explicit Haste percentages. Preserve manual corrections when later observations arrive.
- Keep Character capture active across empty scenes and transient OCR failures. A lost source offers Resume or Choose game window and returns to the same walkthrough phase. Only successful snapshot completion or explicit cancellation ends the flow. Canceling slow source discovery leaves local preview/sharing usable and ignores late source results.
- Replace unsupported native transparent-window resizing with eight clear resize hit regions on all four overlays. Preserve opposite-edge anchors and hide handles when locked.
- Dock any visible overlay to another with touching edges: above/below share width, left/right share height. Follow target movement and resizing through saved dock chains, and drag away to detach.
- Cycle all overlays through **Unlocked → Locked → Hidden → Unlocked**. Preserve suspended groups while globally hidden and restore mouse input on return.
- Keep Windows and Linux packages on one version and verified wiki bootstrap. Default Modern remains the calibrated OCR skin; game composition, native Wayland and production wiki writes retain their manual acceptance limits.

## 0.9.0 - Reviewed wiki contributions and character snapshots

- Add Contribute to Wiki and Character workspaces, sharing the existing main/overlay font settings and log session.
- Make local screen reading opt-in, with explicit source selection, visible capture ownership and bounded offline OCR/journal retention. Character capture pauses contribution capture; imported screenshots do not enable continuous reading.
- Calibrate an optional OCR area from the current source preview; retain per-source/mode regions and reset safely when capture dimensions change. Bounded item-name/stat follow-up reads preserve observed evidence and leave unresolved values unknown.
- Support the Default Modern (`default_modern`) game UI for screen reading, with separate examine and Inventory panes, centered titles, split stat columns and explicit upgrade progress. Other skins remain unverified.
- Keep editable item/NPC/zone candidates and evidence locally. Review extracted fields, uncertain values and fresh potential wiki matches before preparing a page plan from the current wiki blueprints.
- Use the wiki's normal login in a dedicated isolated window. Require explicit review and publish acknowledgement for every planned page; retain conflict guards, per-page results and retry of unfinished changes.
- Include existing-item source edits for confirmed NPC loot when the zone and normal/raid identity are known; leave unverified zone `/who` names Unknown.
- Build character equipment from separate physical item cards, nullable tiers and upgrade progress, augment evidence and 23 named slots with keyboard/select alternatives. Preserve observed No Equipment and equipped statistics separately from calculated gear sums.
- Preserve real capture timestamps and removed-card cutoffs across character reloads and journal replay.
- Search the cached item catalog in Character, preview tier/progress changes in green and add separate physical copies without inventing examine observations.
- Recover reviewed base-stat proposals from tiered drops, forward-check possible values, require choices for rounded ambiguity and omit unsupported or unresolved stats. Preserve the original evidence and label wiki inference explicitly.
- Cycle every overlay through Locked, Unlocked and Hidden from the header. Add visible Parse/Triggers drag grips and resize corners; snap Triggers against the current resized Parse bounds and retain manual height.
- Paint the latest logged player location in both 3D views. Auto Z follows known elevation; manual slicing and NPC inspection keep their own camera/floor until Auto Z is resumed. Unknown height never becomes zero.
- Keep Intel in a stable mob order and retain its visible row and expanded loot during routine updates. A fresh consider or named kill still reveals its matching mob once.
- Include and physically verify every external offline OCR dependency in packaged downloads; isolate packaged OCR checks from development dependencies.
- Preview, copy or save a bounded character PNG. Optional uploads target the authenticated user's own talk page after explicit review; partial upload/talk failures remain recoverable.
- Keep game-log evidence authoritative for supported events and treat OCR output as proposals. Validation uses synthetic/offline OCR, native Windows/Linux X11 and loopback-wiki fixtures; production login/write, foreground-game composition and native-Wayland acceptance remain manual.

## 0.8.9 - Installed fonts, current Settings and clearer item stats

- Choose any installed system font family in Settings, with searchable OS enumeration and a manual family-name fallback; preserve shared main/overlay/viewer typography and the existing presets.
- Clear the previous unversioned interface cache on upgrade and serve current UI files without caching, fixing missing font controls after an update/restart.
- Color item-level-modified values green in main item cards, hover stat blocks and Intel; keep unchanged values and base comparisons distinct.
- Open a complete right-hand loot pane when selecting a Live Map monster, preserving exact raid/normal sources, all drops, shared item tier and explicit route/waypoint/wiki actions.
- Keep a browsable illustrated release history with individual New markers for skipped/unseen updates and immutable versioned screenshots.
- After a newly requested Windows update finishes verification, show a cancellable five-second restart countdown, silently install and relaunch. Keep Linux's verified manual package handoff.
- Default the optional observed swing timer off and keep existing saved choices. Place Settings checkbox labels beside their controls.

## 0.8.8 - Font controls and Linux releases

- Add saved font-family and base text-size controls in Settings, shared by the main app and native overlays while retaining per-panel text adjustments.
- Ship Linux x64 AppImage and deb packages alongside the Windows installer in one versioned release.
- Use native Linux file paths and preserve log-directory filename case, including selected Wine/Proton installations.
- Prefer X11/XWayland for positioned Linux overlays when available; keep explicit backend choices and document native Wayland limits.
- Offer verified Linux update downloads with a clear manual package handoff, while preserving the Windows silent restart/install flow.
- Gate publication on both platform builds and a shared verified wiki bootstrap generation.

## 0.8.7 - Triggers, session controls and complete Intel loot

- Rename the Timers workspace and overlay to Triggers; keep existing saved definitions, countdowns and layouts.
- Put clearly labeled rune capacity granted under Healing, separate from measured healing and HPS.
- Add New session in Combat and the Parse Session tab, preserving the live log cursor, character/map context and running triggers.
- Reconcile NPC-page known loot with item-page drop sources, including Vicar M`Kari and the missing Lord of Loathing items; retain source-instance provenance.
- Overlay mob actions on the name row without shifting the list, and show tier-adjusted item stats from both item names and icons.
- Repair main-app item/NPC loot hover targets and preserve their tooltips through unchanged live redraws.
- Align host data refreshes around a 24-hour freshness guard, check the published manifest hourly while EoZ is open, coalesce overlapping checks and show distinct sync timestamps in Settings.
- Make Raid Zone visibly collapsible and keep its state through updates; named focus can reopen its matching section.
- Start Plane of Hate's native map at Z 120, retain manual slicing, and use the selected floor for unknown-height inspection cameras.

## 0.8.6 - Reliable maps, clean Intel names and simpler updates

- Put the zone title and primary Map controls on one row, with a full-width hover target and a separate unlocked drag grip.
- Keep controls reachable while moving from the title to buttons; retain keyboard access and collapse them after leaving the header.
- Repair the overlay file-policy mismatch that rejected required archive support files when switching to Top or First Person.
- Exercise the real configured-folder and archive-file hydration path in Windows CI, alongside native pointer input over the title.
- Parse styled wiki drop-source links and structured item-table rows as exact source names; exclude location annotations and reward-item transclusions while preserving zone/normal/raid associations.
- Make **Restart to install update** silently upgrade and relaunch EoZ after verifying the staged installer, without a second app confirmation or setup wizard.

## 0.8.5 - Map modes and compact overlay controls

- Collapse native Map controls when its header is idle; replace Fit with Reset and remove Reload.
- Cycle Map, top-down 3D and navigable first person inside the native Map window, loading 3D only when used.
- Make monster names and markers share accurate pointer/click targets and keyboard selection.
- Pin Item Level Slider and My Class above the scrolling Intel list, sharing the main app's saved tier.
- Reveal mob actions on hover or keyboard focus. Each mob's Map action opens a first-person camera preview at that source; remove the global Intel Map button.

## 0.8.4 - Window recovery and Local Map controls

- Remember the main window's size, monitor position and maximized state; recover saved windows when a display is removed.
- Add Minimize to tray and Start minimized preferences with taskbar recovery when the tray is unavailable.
- Remove Pin to top and restore normal Windows title-bar controls. Independent overlays keep their own lock and mouse settings.
- Keep the main map and its footer visible in shorter windows; add zoom controls and mouse-wheel zoom to the embedded Local Map.
- Replace the native Map floor selector with a Z slider and adjustable tolerance; NPCs with unknown Z remain visible on every floor.
- Prioritize Raid Zone above Normal Zone in the Intel list.
- Add the GitHub project link and a screenshot tour in Settings; refresh README screenshots from the current interface.
- Show a green glowing Update Available header button while an app update is available, including after choosing Later.

## 0.8.3 - Map overlay, raid intel and PNUT triggers

- Add an independent lightweight client-map overlay with logged position, named destinations, floor filtering and validated route guidance; remove Minimal view and the Consider window.
- Considering or killing a listed named NPC selects, expands and briefly highlights its intel row with a soft blip, without activating a window.
- Detect Raid Instance headings dynamically in wiki content, preserve normal/raid variants and provenance, and present Normal Zone/Raid Zone groups with complete expandable drops.
- Replace the timer editor with PNUT-style trigger lists and When/Then/Timer editing, isolated regex matching, match previews, captures, cooldowns and local sound/speech actions.
- Check unknown live NPC/item events against a complete bundled wiki presence index. Show Screenshot/Ignore notices inside Timers/Triggers for 15 seconds, paused on hover; explicit screenshots copy locally and never upload.
- Make cumulative item-era filtering explicit, offer eras present in the dataset, and keep First/Top/Map controls on the map page.
- Refresh the release bootstrap from the reviewed production exporter and retain existing log, folder and overlay preferences during upgrade.
- Accept normal Windows short-path cache aliases while retaining updater link protections; run the complete source suite on Windows before publication.
- Preserve normal coordinates for older clients by emitting shared raid NPC variants before their normal counterparts.

## 0.8.2 - Native modular overlays, timers and application updates

- Add a separate Application updates card and header badge, with compatible beta-release discovery, verified downloads, cancellation, Later, and explicit installer approval.
- Keep verified downloads across relaunches, make startup downloading opt-in, and preserve the normal NSIS app identity and user-data profile.
- Reject mismatched installer names, sizes, hashes, redirects and downgrades; permit a replacement download when staged files change and retain the app if Windows handoff fails.
- Translate PNUT’s compact encounter header, exact Overview/Damage/Healing/Taken/Session tabs and flat metric tables into the EQL-themed overlays.
- Replace the large floating timer editor with display-only radial countdown rows and a thin swing bar; all configuration and countdown actions live on the main Timers page.
- Parse own incoming melee, spell, DoT and unknown-caster damage for Taken, with attacker/ability counts and rates while preserving outgoing totals.
- Add four actual transparent native overlay windows for Parse, Zone & loot, Consider and Timers, with saved independent positions/sizes, layout locks, background opacity, font scale and mouse passthrough.
- Keep one shared log/parser/timer session alive when the main window hides; retain player parse tabs, complete ability totals, encounter selection, class-aware scaled loot, waypoint/wiki actions and opt-in routes into the existing Map Explorer.
- Add tray/main/checked-shortcut recovery, monitor clamping, crash recovery and stale-session feedback; sandbox each lightweight renderer with restricted IPC.
- Implement manual/repeating countdowns, saved literal log triggers, zone-filtered kill reminders and one-time spawn reminders from a chosen duration. Persist deadlines and reject historical/stale/replayed timer starts.
- Add an observed melee swing bar using own hits/misses, same-second round deduplication, rolling timing changes, cast hold, optional weapon-delay seed and idle reset. EQL timestamps limit it to an estimate, without hand or weapon inference.
- Add synthetic regression coverage, a real Electron four-window/shared-session smoke and packaged-source parity gates for the new runtime.

## 0.8.1 - Wiki and map integration corrections

- Recover complete ramp candidates with validated exact-endpoint connectors, preserve legal supported stairs, and permit one independently certified local-drop retry when ordinary routing fails. Real Mistmoore/Kurn descents recover while blocked and reverse probes remain rejected.
- Fix exact zone selection, queued archive loads, stale readiness and route ownership, exact logged-elevation HUD, and framing after a hidden map loads.
- Preserve pass-through collision faces and validate both route engines against ground support, full body clearance, legal climbs, and exposed drops before displaying a path. Match Recast agent dimensions and bound rasterization work.
- Permit the routing worker's WebAssembly under the desktop content policy; verify it in actual Electron CI, retain redacted rejection reasons, and check packaged runtime source parity.
- Record 36 rendered local-zone route probes and 27 view/scale captures, while retaining conservative destination markers and the guarded engine policy.
- Convert wiki NPC destinations to the client-map coordinate basis used by named routing, recompute routes after the player moves, and keep cancelled work from restarting a destination through fallback.
- Apply the wiki's +10 Range per tier to every item with a listed Range, including bows and throwing weapons.
- Honor `Class: ALL except ...` in existing packs and export the actual allowed classes in future packs, keeping unusable loot out of class-filtered recommendations.
- Extend the exporter's exact zone aliases so current wiki zone names retain their NPCs. Installing the reviewed server catalog and rebuilding the dataset is a separate operator step.
- Preserve every recognized explicit NPC template zone before category/title fallbacks, so stale categories cannot move a spawn or discard its second zone.
- Repair a corrupted local dataset on Sync, require SHA-256 verification, and enforce timeouts and size limits through dataset reads.
- Require the installer to embed the exact verified dataset fetched for its build, with bundled dataset versions and record counts in the build log.
- Update Electron within major version 43 and compatible transitive dependencies so the high-severity dependency audit passes.
- Record fresh dataset provenance, private local-archive parse observations, regressions, and outstanding real-client validation in the integration audit.

## 0.8.0 - Guarded real-zone spatial candidate

- Exported the viewer's already-decoded collision meshes as finite `Float32Array`/`Uint32Array` data in its existing right-handed Y-up basis, skipping props and pass-through geometry without introducing another EQ coordinate transform.
- Added cooperative, cancellable zone export plus a bounded route-corridor crop so zone rendering and the established worker-first route remain available while the Recast/Detour candidate prepares.
- Wired the pinned Recast worker into named-mob routing. It receives transferable route-local geometry, rejects partial or unvalidated results, and atomically replaces only the rendered golden ribbon while preserving destination, view mode, camera, Z slice, cue HUD, and automatic fallback.
- Made zone, destination, and request changes terminate stale candidate workers. Timeouts, engine faults, missing geometry, oversized crops, and validation failures leave the existing route or destination marker intact.
- Matched Recast and the independent post-query guard to the shared +6 upward-climb rule, generated only downward off-mesh drop links, and indexed corridor triangles in worker-local X/Z cells so dense validation does not scan the full crop for every sample.
- Added diagnostics schema v2 with allow-listed collision counts, timings, engine outcome, validation count, and fallback reason; character/target identity, player and route coordinates, worker error detail, and filesystem paths are excluded while location readiness remains boolean.
- Added viewer-export/crop/winding/cancellation/drop tests, an export-to-Recast integration test, latest-request worker replacement tests, and Windows ASAR checks for the collision module, client, integration markers, and bundled worker.
- Carried forward the 0.7.9 intel-first Minimal defaults and WLD skipped-material cursor repair. EQEmu's WLD polygon/material loop independently confirms that material groups consume polygon ranges sequentially; proprietary Mistmoore/outdoor visual confirmation remains a release gate.

## 0.7.9 - Intel-first minimal view and WLD material repair

- Made Minimal view default to the named-and-rare-mob intel panel, with the 3D map hidden unless explicitly enabled in Settings.
- Added independent **Show map** and **Show path controls** preferences. Waypoint copying, consider detection, and loot remain available when both are off.
- Removed the minimal-header destination search; routing, when enabled, starts from the mob list rather than duplicating a search surface.
- Changed **My Class** loot in both Minimal view and the consider tray to exclude statless and weight-only items.
- Replaced eager desktop archive reads with metadata indexing and current-zone hydration, and corrected the false permission status.
- Fixed WLD material-group cursor drift so skipped groups consume their polygon counts instead of shifting every later texture onto the wrong faces.
- Added release checks for lazy reads, material-group alignment, minimal defaults, and class-loot eligibility.

## 0.7.8 - Compact fly-first map controls

- Collapsed the embedded map viewer to one control bar: zone load, Succor reset, a compact pop-out Z-depth slicer, and view controls now share the same row; the Grounded and Floors controls are no longer exposed.
- Made First Person initialize in Fly mode and removed the center-screen click-to-enter prompt. Clicking the map still captures mouselook without covering the scene.
- Changed Reset to target an explicit `Succor`/`Safe Point` map label, with the conventional zone origin as fallback, while preserving First, Top, or Map presentation.
- Moved route graph generation to the existing Web Worker before any collision projection. The renderer no longer performs the old 24k/50k/full collision-graph passes, while projected candidate segments still enforce the six-Z upward bound.
- Made Cancel Path clear the destination owner state as well as the in-flight calculation, preventing movement-driven automatic rerouting from restarting a cancelled route.
- Expanded S3D texture aliases, forced repeating WLD texture sampling instead of clamp-to-edge stretching, and invalidated v16 parsed-zone caches.
- Added a focused regression gate covering fly-only UI, one-row chrome, Succor reset, worker-first routing, persistent cancellation, and texture sampling.

## 0.7.7 - Verifiable map-coordinate release

- Added the reported side-by-side Mistmoore capture as an exact regression: game Map `X -222.75, Y 125.50, Z -154.10`, canonical world, client `.txt` map, and viewer placement must all converge without an axis swap.
- Changed the viewer HUD and sync footer to use the in-game Map window's explicit `X / Y / Z` labels instead of exposing canonical world-axis names or relying on an unlabeled `/loc` tuple.
- Added the running app version to the always-visible desktop title bar and browser/taskbar title so a surviving or duplicate older installation is immediately identifiable.
- Added a post-build ASAR integrity gate to both Windows workflows. The uploaded installer must contain the current package version, title-bar version binding, coordinate formatter, viewer transform, and Map HUD before it can be published.
- Added Legends `/who` zone detection from the current character's row, including instance-number removal and stable short-name matching, so the map can recover without waiting for a separate zoning line.
- Added automatic versioned GitHub prereleases for the first verified `main` build of each `0.x` version; repeat builds preserve the existing tag, and explicit `0.x` tags are also marked prerelease.

## 0.7.6 - Player-facing coordinate clarity

- Corrected the player anchor itself: client `.txt` maps negate canonical world X/Y but do not swap them. Restored the viewer's matching map basis so Mistmoore game `/loc -330, 120, -178.13` lands at the real local-map Succor anchor `-120, 330, -180` instead of the rotated `330, -120` point.
- Made every visible viewer coordinate use EverQuest's exact `/loc Y, X, Z` order; canonical world and client-map axes remain internal implementation details.
- Removed the Map-only reverse conversion that made the same synced position appear numerically different when changing First, Top, and Map presentations.
- Added real Mistmoore and Befallen Succor map anchors as end-to-end transform regressions alongside the stacked-floor fixture.
- Made the root `maps` family win over silently selected larger custom map packs, matching the in-game `default` dropdown unless the player deliberately chooses another set in a future preference; sync status now names the map set in use.
- Updated the Windows acceptance script to compare the app's displayed `/loc` directly with game chat in multiple zones.

## 0.7.5 - Coordinate truth and compact navigation

- Separated logged/wiki, canonical world, client `.txt` map, and Three.js viewer coordinates instead of sending all four through one ambiguous transform. This release still swapped the two client-map axes; 0.7.6 corrects that remaining defect with real zone anchors.
- Normalized EQLWiki NPC locations into world X/Y before distance, labels, and routing, while converting back to EverQuest Y/X/Z when copying a game command.
- Restored paste-ready `/waypoint` copying from NPC names in the minimal rail and NPC browser, with keyboard access, non-modal confirmation, a guarded Electron clipboard bridge, and fallback behavior.
- Moved minimal-mode destination search, Path, and Clear into the persistent 48-pixel header and removed the redundant route band so the map receives the recovered vertical space.
- Kept Map Overlay intentionally readable as client `.txt` line art, while adding safe available/material/resolved texture counts to diagnostics for First/Top S3D troubleshooting.
- Added coordinate-boundary, waypoint-order, compact-header, clipboard-bridge, texture-instrumentation, and packaged-viewer regression gates.

## 0.7.4 - Presentation-safe route selection

- Stopped wiki-coordinate route starts from forcing First Person or closing Map Overlay.
- Wrapped local map-label route starts so their legacy internal setup cannot commandeer the player's Top Down or Map Overlay choice while background routing runs.
- Restored the original route-progress message after presentation restoration and added a release regression that forbids the known forced-First-Person path.

## 0.7.3 - Isolated navmesh worker proof

- Added a pinned, deterministic 747 KiB `recast-navigation` 0.43.1 module-worker bundle with transferable geometry buffers and build/package checks.
- Ran both the reference topology router and candidate Recast/Detour engine against the same eight redistributable fixtures; all expected path/no-path outcomes pass.
- Rejected Detour partial paths, projected sparse funnel results back onto collision surfaces, and added independent post-query guards for walkable support and downward-only drop links.
- Added a latest-request-wins worker client with calm Finding/Updating/fallback states, stale-result suppression, timeouts, worker restart, and an explicit contract that callers retain the last valid route.
- Retained the current viewer pathfinder as production authority; the candidate worker is bundled but dormant until real zone geometry and Windows/game-client gates pass.
- Added exact MIT/Zlib notices, pinned lockfile integrity, dependency-tree validation, and high-severity audit gates to CI and Windows release workflows.

## 0.7.2 - Geometry-backed spatial contract

- Extended every asset-free route fixture into shared typed triangle geometry with one right-handed Y-up coordinate contract, upward winding, start/goal anchors, and agent constraints.
- Represented exposed drops as downward-only off-mesh connections, kept closed doors physically disconnected, and retained the +6 ascent contract for candidate engines.
- Selected pinned `recast-navigation` 0.43.1 for an isolated worker prototype after documenting licensing, package footprint, packaging, supply-chain, fallback, and API risks; the production pathfinder is unchanged.
- Defined calm route-engine UX states: keep the last valid path visible, never block map input or change views, swap validated routes atomically, hide implementation jargon, and preserve explicit recovery.
- Quantized player-facing distance labels while keeping exact internal values, reducing distracting single-unit churn during movement-bound `/loc` streams.

## 0.7.1 - Live route confidence and handoff

- Added live remaining distance plus turn, facing, off-route, and arrival cues derived from the collision-valid golden path in First Person, Top Down, and Map Overlay.
- Kept the full and minimal route status synchronized with new `/loc` samples so a moving player sees the next action without reopening route controls.
- Added a Settings export for redacted support diagnostics using an explicit allow-list that excludes character names, log contents, log filenames, and filesystem paths.
- Added a deterministic, asset-free route corpus with eight outdoor, indoor, stacked-floor, ramp, closed-door, exposed-drop, and illegal-ascent expectations plus pass-rate and segment-policy reporting.
- Added a repository-native contributor handoff and implementation-status index, cross-linked from the README and vision with the exact next road-to-v1 task.
- Marked shared geometry-backed corpus adapters as the next 0.8 evidence gate before adopting a reviewed worker-based Recast/Detour pathfinder.

## 0.7.0 - Replacement-map navigation loop

- Added dataset-backed named and rare-mob labels directly to First Person, Top Down, and Map Overlay views, prioritized by known current-class loot and routable with one click.
- Rebuilt the minimal-mode mob rail around useful current-zone targets, relevant-first ordering, mob/loot search, route state, distance, and expandable Itembox-enabled loot instead of a long undifferentiated list.
- Added stable heading interpolation across recent `/loc` samples, retaining facing through duplicate/jitter lines and refusing to invent a heading after a zone-scale position jump.
- Made location sync preserve the selected map presentation internally instead of switching through First Person on every update.
- Increased live log responsiveness while a map or route is active and coalesced bursts to the newest `/loc`, preventing movement-key bindings from creating a renderer backlog.
- Kept persistent routes updating during continuous movement without an endlessly-reset debounce, while retaining collision validation and the eight-unit re-route threshold.
- Documented `/loc` movement-key setup in the compact navigation surface and expanded the v1 roadmap around a replacement-map product contract.

## 0.6.0 - Usable exploration loop

- Replaced ambiguous map Sync failures with a visible Folder → Log → Zone → `/loc` readiness sequence and state-specific recovery actions.
- Added one persistent current-zone destination field with named suggestions, explicit route/marker/error status, shortest routed distance, Clear, and automatic re-routing after meaningful `/loc` movement.
- Kept First Person, Top Down, and Map Overlay controls available across full/minimal transitions, remembered the last full view, and preserved explicit same-zone floor filters during re-centering and route updates.
- Added a remembered minimal-mode intel collapse control while retaining current-fight DPS, named mobs, class drops, route controls, pinning, and Full view.
- Expanded current-zone/class item discovery with embedded icons, slot and sort overrides, one-click Reset, useful-gear-first ranking, and honest scope/empty states.
- Made Itembox details keyboard reachable and made tier-adjusted values update immediately, visibly highlight changes, and retain base values for comparison.
- Repaired S3D WLD material resolution by using bitmap fragments' actual `fileName`, normalizing BMP/DDS names, supporting animated frame filenames, and invalidating stale v15 parsed-zone caches.
- Replaced routine focus-stealing browser alerts with dismissible in-app notices, and added Ctrl/Cmd+K plus `/` shortcuts for the reliable wiki-only Search EQLWiki field.
- Improved NPC relevance ordering while retaining modern con text and tile tinting, and kept all existing consider tray, encounter, loot evidence, pin/taskbar, coordinate, and directed movement contracts.
- Expanded the product vision into a release-gated road to v1 with journey contracts, user stories, click budgets, risk ownership, uncoached usability tasks, and a Windows/game-client acceptance script.

## 0.5.4 - Release pipeline reliability

- Separated clean-checkout tests from the production catalog relevance gate so CI no longer expects the intentionally git-ignored bootstrap pack before it has been downloaded.
- Added a verified production-data fetch followed by the relevance gate to CI, Windows installer, and tagged-release workflows.

## 0.5.3 - Live map and movement routing

- Removed the erroneous planar sign inversion from logged `/loc` coordinates while retaining EverQuest's Y/X-to-X/Y ordering, so negative in-game map positions remain negative in the viewer.
- Stopped trusted `/loc` and NPC-label elevations from snapping to an upper floor in stacked dungeons; grounding now honors the reported Z with only the six-unit movement tolerance.
- Added the Legends rare-creature consider wording (`- a rare creature - scowls at you`) to the parser so a fresh consider opens the bottom-docked loot tray with the clean NPC name.
- Reworked geometry-derived routing as a directed movement graph: upward travel is capped at exactly 6 Z, downward travel is unlimited, and a drop cannot be reversed as an invalid climb.
- Prevented routes from falling through overlapping floors, tightened indoor-zone sampling for narrow corridors and stairs, and retained wall/collision validation for every route edge.
- Matched first-person step and jump configuration to the same six-unit routing constraint and invalidated old parsed-zone cache data.
- Kept First Person, Top Down, and Map Overlay controls available in minimal mode, persisted the chosen mode, and recentered that mode instead of forcing First Person after every `/loc` update.
- Added explicit game-folder/map-file readiness states and automatic viewer reconnection so Sync distinguishes a missing folder from a configured folder that is only waiting for `/loc`.
- Changed the Items default from an alphabetical global catalog to current-zone, current-class results ranked toward equipment and meaningful stats; deliberate search broadens the scope.
- Made detected classes visible through an Auto filter state and added a clear Current zone scope control.
- Made the Item Level Slider update already-open Itembox tooltips and display a clearly labeled tier-adjusted stat block alongside wiki base lines.
- Kept repeated `/loc` events out of Overview activity and renamed manual map recovery actions around their actual result: reload the zone or center on the last `/loc`.
- Added a comprehensive product and UX vision with click budgets, end-to-end flows, user stories, recovery language, acceptance scenarios, and a phased roadmap.

## 0.5.2 - Consider loot tray

- Restored consider-driven loot intelligence as a temporary bottom-docked tray without bringing back the unreliable permanent Current Target card.
- Added class filtering, item icons and Itembox hovers, wiki links, and direct pathing for the considered NPC.
- Kept the tray open while hovered or keyboard-focused, then resumed its dismissal timer after inspection.
- Normalized apostrophe and backtick variants when matching considered NPC names to EQLWiki drop sources.

## 0.5.1 - Map alignment and navigation

- Normalized logged `/loc` output into the coordinate basis used by EverQuest map files and EQLWiki locations, fixing the swapped and inverted player marker in Befallen and other zones.
- Made the first-person minimap player-centered and heading-up from consecutive `/loc` samples, with nearby named mobs and the active route labeled directly on the map.
- Switched route calculation to a height-aware walkable-surface graph derived from the rendered zone collision mesh, preserving floors, ramps, walls, jump limits, and drops while reporting shortest-route distance.
- Repaired S3D material-to-bitmap resolution so original zone textures load instead of placeholder gray/white materials.
- Bumped the parsed-zone cache version so existing installations rebuild previously cached zones with corrected texture data.

## 0.5.0 - Release UX and map overhaul

- Added first-run EverQuest folder setup and automatic selection of the most recently modified `eqlog_*.txt` under `Logs`, with folder and log overrides in Settings.
- Removed the unreliable current-target surface, last-location metric, and remaining player-card redundancy; the header now shows character, classes, level, and zone.
- Added explicit First Person 3D, Top Down 3D, and Map Overlay modes, with all floors shown by default.
- Corrected the EQ-to-viewer coordinate flow and made consecutive `/location` updates face the player's movement trajectory.
- Kept route-to-NPC support map-label-first with schema-v3 EQLWiki coordinates as the fallback.
- Changed pinned mode to hide the draggable title bar while keeping Eye of Zomm visible in the Windows taskbar.
- Added the modern light-blue consider band and verified yellow at +1 through +3 and red at +4 or higher.
- Reduced helper copy and removed every retired product-name reference from the app and repository.
- Upgraded the exported dataset to schema v3 so two-coordinate locations and pages with multiple location tuples are handled safely.
- Added loopback request/file bounds, state-changing POST guards, first-run/log-selection tests, exporter fixtures, UI checks, and release checks.
- Added optional trusted Authenticode signing and verification while allowing clearly identified unsigned builds until a certificate is configured.

## 0.4.0 - Map and target focus

- Corrected consider colors so +1 through +3 are yellow and +4 or higher is red.
- Made Current Target a permanent, prominent Overview panel with class-filtered loot.
- Expanded minimal mode with current-fight DPS, a pathable mob list, and a temporary hoverable target-loot panel.
- Persisted the user-approved EverQuest folder handle and inferred the installation root from the selected log path.
- Added automatic first-person location focus and NPC route fallback to exported EQLWiki coordinates.
- Changed pinned mode to hide the application from the Windows taskbar.
- Restyled item hovers after EQLWiki's Itembox and extended the cPanel exporter with Itembox lines and embedded icons.
- Removed redundant helper copy and the duplicate Player card.
- Added optional Authenticode signing and signature verification to Windows build/release workflows.

## 0.3.0 - EQLWiki - Eye of Zomm

- Rebranded the project as **EQLWiki - Eye of Zomm**.
- Changed the Windows application identity, installer name, shortcuts, and custom protocol to `eqleoz://`.
- Moved player-facing dataset checks away from EQLWiki and onto the GitHub `dataset` branch.
- Dataset synchronization now checks GitHub on every application startup and on **Sync with Wiki** button press.
- Added low-priority MediaWiki server exporter + one-commit GitHub dataset branch publishing workflow.
- Added repository-scoped deploy-key support for weekly/manual cPanel synchronization without a personal token.
- Kept the embedded Zone Viewer navigation-focused and removed additional nonessential viewer controls from the app UI.
- Expanded exported NPC metadata with race, class, and description where present.
- Retained local wiki search and explicit Open on Wiki behavior.
- Added persistent **Pin to top** and a compact map + named-drop minimal view.
- Added local item hover tooltips, observed loot history, and logged drop-rate estimates.
- Added configurable combat encounters named for the first attacked NPC and their start time.
- Repaired embedded Zone Viewer startup and current-zone/location synchronization.
- Simplified the header search to a reliable, wiki-only **Search EQLWiki** field.
- Added con-color tinting to NPC cards and current-zone NPC rows.
- Screen reading remains intentionally unimplemented.
