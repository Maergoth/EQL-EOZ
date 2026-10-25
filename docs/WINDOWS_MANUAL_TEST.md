# Eye of Zomm Windows/game-client acceptance test

Release acceptance target: `EQLWiki-Eye-of-Zomm-Setup-0.9.10-x64.exe`.

Run this against a normal EverQuest Legends installation. Before testing, fully exit any running Eye of Zomm process. Confirm the header visibly says `v0.9.10` and the normal Windows title bar is present; stop if it does not. Record Windows scaling, zone category, and pass/fail; never share character identity, raw logs, coordinates tied to a character, filesystem paths, or game archives. Future releases must update both version strings in this introduction, while retaining every applicable earlier section. Release authorization does not mark this manual matrix complete; record observed results separately in [the live capture recovery plan](LIVE_CAPTURE_RECOVERY.md).

## Overlay drag and resize acceptance

1. Unlock all four panels. Drag from the Parse grip, Map grip, Zone & loot title,
   and Triggers body/grip. Test the whole visible grip, including its corners,
   at narrow widths and the smallest/largest font settings. Dragging must move
   the selected panel without resizing it; menus, selects and map controls must
   retain their normal interaction. Repeat with Triggers at its 36 px minimum
   height. Every edge and corner must still show and perform its own resize.
2. Build a dock chain, then drag its root and a middle panel separately. The
   selected panel must detach immediately, keep its size and follow the pointer
   without moving its former parent or children. Direct children remain where
   placed, with their own remaining children unchanged. Session updates during
   the drag must not pull any panel back or change its size.
3. Release more than 8 px from all eligible edges: the panel remains free.
   Release within 8 px of a new panel: edges touch, above/below share width and
   left/right share height. The formerly connected group must not be eligible
   for that drag; release and start a new drag to dock to it again. Resize the
   newly docked target and confirm size sharing still propagates normally.
4. Repeat around monitor edges, at 100/125/150% OS scaling, and after locking,
   hiding/showing and restarting. Locked or click-through panels cannot drag or
   resize; global Hidden retains the suspended layout. Record real compositor
   and foreground-game behavior separately from synthetic fixture results.

5. In the native Map view, one `/loc` shows a dot. Move and emit another to show
   a short arrow pointing in the actual map trajectory; stop and repeat `/loc`
   to retain it. Check both axes, a turn, a zone/log switch and a large jump.
   Arrow direction estimates movement, not a logged facing value. Set overlay
   opacity to its low/high limits: empty 2D map areas must reveal the desktop,
   with crisp map strokes. Top/First Person fade their entire native 3D surface.
   The main embedded map and its existing directional Local Map stay independent.

## 0.9.10 contribution and item acceptance

1. Inspect the same item in Character, Items/NPCs/loot/Live Map and native Intel.
   Confirm the shared silver wiki frame, inline stats, proc link, green changed
   values and chosen font. Character tier/socket controls stay usable; only
   Exaltation name/effect is shown, and recorded totals stay unchanged.
2. Open an item form: screenshot and inline Icon ID paste appear together.
   Classes/Equipment slots are fixed-choice multiselects; source entry reuses
   Zone. Preview complete page changes, check **I reviewed these page changes**
   once directly above Publish, then publish. Verify saved-page links, effects, empty item fields and partial
   retry. Use only an authorized test account for coordinated actual edits.
3. Review tiered evidence: automatic compatible base proposals appear in the
   page preview, valid manual edits survive, unsupported numbers require
   correction and the tier-zero verification note remains. Ambiguous missing
   weight punctuation cannot silently publish a ten-times-larger weight.
4. A nearby cast or consider must not create a new-monster contribution. Check
   a genuine kill/death/named-corpse source, its private triggering line and
   destination links. Known players/pets remain excluded. Do not share raw lines.
5. Choose Contribute on a missing encoded chat-item link and keep the complete
   examine visible. Verify inline source choice, pinned waiting, matching fresh
   OCR green completion and dismissal. Unrelated, manual, replayed or stale
   frames cannot complete it. Pause/resume/calibrate/resize, retry a failed
   source and cancel while startup is pending. Preserve Character and existing
   contribution readers; only the request-owned stream may stop at completion.
6. Choose Contribute after an unknown monster kill, wait beyond five minutes,
   then type a fresh `/loc` at its spawn. The accepted notice stays pinned until
   capture/dismissal, flashes green and closes. Reject earlier locations and
   mismatched zones/log sources. A newer monster prompt replaces the prior target.
7. Share a reviewed Character sheet with one Share action; preview/copy/save
   stay local. Account/revision/destination changes still invalidate the review.

These checks require separately recorded observations on the new build. The
synthetic fixture receipts and prior release passes do not complete them.

## Historical 0.9.8 targeted acceptance

- Adjust equipped-hover tiers with pointer and keyboard. Keep the hover, focus
  and scroll position stable, show real proc details and retain recorded totals.
  Import attached known Exaltations, preserve explicit socket evidence and use
  five only when capacity is unknown. Reject unknown wiki gear without fake stats.
- Preview two Character (Server) sheets on the authenticated User page. Reshare
  one without changing its sibling/unrelated prose or old talk-page content.
  Account/destination/revision changes must force a fresh guarded review.
- Review missing-page versus existing-source/population/tier-zero tasks. Keep
  generated pets suppressed unless known in the wiki. A fresh unknown kill arms
  one next `/loc`; stand at its spawn, then type the command. Newer kills replace
  the active target, and source/zone/timeout changes cancel it without losing drafts.
- Check readable fields, Common/Unique Loot, screenshot select/paste and local
  cropped-icon matching. Preserve edits during background evidence, reject
  unsupported base recovery, review every page and safely retry partial results.
- With synthetic observations only, exercise offline restart, overdue hourly
  retry, logout/account switch, Settings opt-out and pending-write close/reload.
  No pending observation may silently disappear; no article publishes from logs.
  Keep the app open with a recovery message when a normal drain cannot save.

These targeted checks supplement the unchanged inventory/stat and overlay/map
matrices below. Synthetic native fixtures are separate from real-client and
production wiki acceptance; record what was actually exercised.

## 0.9.7 inventory export and observed stat acceptance

This is the current Character matrix. Earlier versioned Character procedures
below are historical: do not unequip or use item OCR for the 0.9.7 flow.

1. Validate name/server/race/classes/level/AA, keeping gear equipped. Type
   `/outputfile inventory` yourself. Verify the fresh matching file auto-imports;
   older exports wait, the chooser is explicit, and malformed/partial/wrong-
   character imports leave saved gear intact. Check paired/Any slots, literal
   tiers and duplicate worn copies; bags/bank/Held/KeyRing cannot become gear.
2. Follow the prominent **Open Inventory → Scroll down → Click off buffs**
   instructions. Keep all gear equipped and the Inventory heading/full stat panel
   with Additional Modifiers visible. Explicitly select Default Modern capture,
   read at the lower 1 FPS cadence and review unread numbers. Verify stale source,
   generation/profile and pending-file results cannot become the new proposal.
3. Confirm only recorded current stats appear: maximum HP/Mana/Endurance once,
   distinct AC/ATK components, Accuracy bonus versus ATK Accuracy, all ten
   modifiers, zeros and unknowns. Changing an item/tier/catalog preview must not
   recalculate these totals. Legacy base/equipped evidence must not replace them.
4. Unknown wiki gear/augments must leave public slots/sockets empty, not red-link
   items. Review missing-item details in Contribute, sync accepted wiki data and
   re-export. An item tooltip must not create Character gear. Clear inventory
   affects only this character's imported gear/evidence/current stats; identity
   and other characters remain. Repeat restart/profile-switch/async-cancellation.
5. Review PNG and own-talk share. Use an authorized test account only for an
   explicitly coordinated actual edit; ordinary regression checks use loopback
   writes or unsaved parsing. Verify capability/revision guards and other
   characters/discussion remain. Record actual game UI scale, source resolution,
   missing fields and limitations privately; no new live-game pass is claimed.

New source/native/Windows/Linux/package gates remain pending release-owner
acceptance. Earlier receipts and screenshots do not certify these changes.

## Historical Character acceptance through 0.9.6

0.9.6 uses a single equipment total panel, maximum resources, indexed augment
pickers and empty-slot Add item with wiki search, a tier slider and explicit
screenshot paste. Interactive own-talk sharing replaces the matching Character
(Server) sheet and preserves other characters/discussion. See
[CHARACTER_SHEETS_PLAN.md](CHARACTER_SHEETS_PLAN.md) for current acceptance and
wiki template/renderer activation. Existing persistence, known-item placement,
manual capture ownership and private evidence boundaries continue unchanged.


0.9.5 adds visible selected-item tier/progress controls with labeled catalog previews,
private Character storage independent of the loopback port, automatic cross-session
item reuse, explicit extra copies, two manual Any slots, strict compatible-slot
placement and drag highlights. Removed-item suppression is scoped to a capture
pass; fresh later passes and Rescan removed items recover valid reads. See
[the current persistence plan](CHARACTER_INVENTORY_PERSISTENCE.md) for the
archive audit, acceptance and limits.

## 0.9.5 persistence, tier and placement

1. Change a selected item’s tier/progress with Edit captured values closed. Check
   green wiki-preview values, preserved original stats and Use captured stats.
2. Restart the app and confirm inventory, equipment, identity and walkthrough
   remain saved. A new walkthrough keeps inventory while rebuilding placements.
3. Read the same item again; no automatic extra copy should appear. Add Second
   copy manually and verify ambiguous reads request the intended physical copy.
4. Drag known gear: compatible slots and both Any slots light up; incompatible
   normal slots reject it. Any placement stays manual.
5. Remove a bad read. The held tooltip must not recreate it. Use Rescan removed
   items, show a fresh complete tooltip and confirm recovery. Old queued frames
   cannot recover it. Verify actual live recall separately from fixture tests.

## Earlier 0.9.4 Character inventory

1. Use Default Modern. Unequip slowly, one item at a time, keeping the complete
   tooltip visible until its card appears. Verify one tier label, known-item
   automatic placement and retained original observed text in item review.
2. Review an uncertain name. Unmatched items must remain loose, with red glow
   and yellow !; they cannot equip by dragging, slot selection or ANY review.
   Choose a potential match and check the original stats/tier remain intact.
3. Equip, replace and unequip separate physical copies. Equipped IDs must leave
   loose inventory and return once on unequip. Check identity, level, classes,
   AA count and dynamic estimates, then reload the saved snapshot.
4. Hover/focus icons and select them for details at compact width and 10–20px.
   No class artwork is invented; text initials are the fallback. Validate actual
   game throughput separately from synthetic native walkthrough checks.


## 0.9.3 live item recovery

1. In Default Modern, hover complete item tooltips during Unequip, Re-equip,
   Confirm slots and Save snapshot. Newly observed items must reach inventory
   in all four stages. Repeated reads update one card; explicit physical copies
   and removed cards retain their existing behavior.
2. Restore an unfinished older Slots draft and resume its trusted source.
   Current-session eligible reads can recover without duplicating cards or
   promoting an earlier Base frame into an item/baseline.
3. At the game's actual resolution, retain an explicit private source frame and
   compare full-scene versus tooltip-region OCR. Record name/stat uncertainty,
   acquisition latency, queue behavior and any missed brief tooltip separately.

## 0.9.2 compact item tooltips

1. In Default Modern, start the Character walkthrough and hover an equipped
   item's name/icon while unequipping. Its compact tooltip should produce one
   editable card without opening the larger examine window. Include a one-word
   item name, a weapon and an armor item. Keep each tooltip visible until its
   card appears, especially when the reading queue grows.
2. Move between several items, then advance to No Equipment while a previous
   item is still being read. The earlier item should arrive once; a stat frame
   captured before the No Equipment step must never become the new baseline.
3. Change the selected source/area, pause and resume, then cancel. Old queued
   results must not appear in a different source/session or revive capture.
   A saturated queue should show a warning instead of claiming every item was
   captured. Record resolution, font/UI scale and missed/incorrect fields.

## 0.9.1 guided Character and touching overlays

1. Start Character from details including AA count. Select the Default Modern game
   window inline. Remove ANY items first, examine items while unequipping, and
   verify obvious slots fill without displacing another item. Use Second copy
   for identical physical items and the inventory × to remove a mistaken card.
2. Confirm all gear is off before reviewing the fresh No Equipment block. Check
   mitigation/softcap/evasion AC and offense/accuracy separately. Correct a value,
   wait for another read and ensure the edit persists. Confirm the baseline,
   re-equip normal items then ANY last, and resolve remaining slots together.
3. Correct explicit Haste in the written item text, Save item and verify a new
   read preserves it. Inspect the baseline/gear/equipped estimates; unknown
   server formulas must remain unknown. Canceling Save keeps capture; successful
   Copy/Save completes once. Lost-source Resume or Choose game window retains the
   phase. Explicit Cancel ends the walkthrough and retains captured cards.
4. On all four unlocked overlays, hover every edge and corner. Axis/diagonal
   arrows and actual resizing must replace the cancel cursor. Check opposite
   anchors and locked handles. Dock each side of another panel: above/below share
   width, side-by-side share height and edges touch. Resize the target to keep
   followers aligned; drag any panel to detach it without moving its neighbors.
   Use the current drag/release matrix above. Repeat at monitor edges and other DPI.
5. Cycle **Unlocked → Locked → Hidden → Unlocked**. Globally hidden groups return
   together; individually hiding a panel detaches its relations. Verify mouse
   input and saved layout after restart and display removal.

## 0.9.0 optional capture and contribution acceptance

Use an isolated profile initially. Screen reading must remain off until enabled.
Select the game window explicitly, Start contribution capture, then start/stop a
Character session and verify contribution capture pauses/restores correctly.
Stop and source loss must release capture without affecting log-based overlays.
Import an examine PNG from Character without starting live capture; correct OCR
names/stats before assigning slots. Capture No Equipment and equipped values
separately and inspect the complete PNG before copying/saving.

Prepare a contribution with current wiki matches and blueprints. Review every
page and uncertainty; do not publish test data to the public wiki. Production
login/2FA/CAPTCHA, normal/raid template ambiguity and own-talk upload require
explicit real-user acceptance. Fixture auth/upload tests do not establish those
live behaviors. Record skin/resolution/OCR omissions and Linux portal/compositor
limitations in the [feature plan](CAPTURE_CONTRIBUTIONS.md).

## 0.8.9 installed fonts and UI refresh

1. Upgrade a profile that has cached an older Settings page. Fonts must appear on
   the first launch, with the new UI version; saved log/overlay preferences remain.
2. In Settings → Fonts, refresh installed fonts and choose a family absent from
   the presets. Apply it, resize text, restart, then reset; inspect every overlay
   and the embedded map. If enumeration is unavailable, enter a family manually.
3. Move the item tier slider. Only changed numeric values are green in cards and
   main/Intel hover blocks. Inspect reduced weight and negative penalties too.
4. Click a Live Map mob: all its known loot is reachable in the right pane, with
   matching tier tooltips. Normal and Raid variants remain separate; Route is
   explicit. Resize/scroll at 1024px and the largest text setting.
5. Browse older What's New releases; only viewed releases lose their New label.
   A new Windows download shows Restarting in 5; Cancel restart retains the staged
   package. Verify an approved silent installer/relaunch with real packages.
6. A fresh profile has the observed swing timer off. Explicitly enable it in
   Triggers → Swing to use it. Existing saved choices remain intact.

## 0.8.8 font controls

1. In Settings, change font family and base text size. Check navigation, tables,
   item/NPC stats, trigger editor, notices and all four overlays. Changes apply
   immediately and survive restart; Reset returns the theme defaults.
2. Combine the smallest/largest base size with each panel's smallest/largest
   text adjustment. Check map labels/header/footer, Intel's sticky controls,
   hover actions and scrollable tooltips, parse tabs and trigger auto-height.
   Required controls must remain reachable without clipping or hover reflow.
3. Restore an existing 0.8.7 profile. Font defaults must preserve existing
   overlay layout, panel text settings, log selection and running triggers.
4. Confirm Windows keeps the verified silent Restart to install update flow.
   Linux has a separate package handoff and [acceptance guide](FONTS_LINUX.md).

## 0.8.7 Intel, session and trigger acceptance

1. Check main navigation, page heading, overlay controls and tray all say Triggers. Existing definitions, running countdowns and layout must remain.
2. Read logged healing and rune grants. Healing shows rune capacity separately, without inflating actual healing/HPS or reporting damage absorbed.
3. Start New session from Combat and from Parse → Session. Totals/encounters/loot clear; unread log lines continue once, with the same character, map, timers/triggers and discovery state.
4. In Intel, set tier 7 and hover a mob name. Actions cover that same row without changing the row/list height. Move to each action; keyboard focus also reaches them. Hover/focus both item icon and name to inspect scaled/base stats.
5. Collapse Raid Zone: a clear collapsed label/chevron remains. It stays collapsed through heartbeat/tier/search changes; a fresh named consider/kill in that section reopens its matching mob/drop list.
6. Sync the rebuilt wiki pack. With My Class off, compare Vicar M`Kari's 11 known drops and Lord of Loathing's Diamond Rod/Wand of Conflagration against their wiki sources. Class filtering may intentionally exclude ineligible classes.
7. Enter Plane of Hate. Native Z starts at 120 ±25, remains adjustable through later /loc messages, and Reset restores 120. Other zones retain their normal starting elevation; unknown-Z markers remain visible. Check actual ceiling clipping and first-person unknown-height preview with local zone archives.

## 0c. Overlay map and anchored Intel

1. Move onto the zone title anywhere across the Map header: Reset, Follow, view cycle and zoom reveal on the same row as the title. Move to each button without losing controls, then leave for the canvas and confirm collapse. Repeat locked/unlocked and at narrow widths/largest text. The explicit drag grip moves only an unlocked window. Keyboard focus must also reveal controls. Verify no Reload remains and Reset restores the default Map/follow/zoom state.
2. Hover/click a monster's actual drawn name, including a name far from its dot. The pointer cursor and selected source must agree. Repeat using its keyboard target.
3. Cycle Map → Top → First inside the same native window using an installation containing normal archive support files, including `mp3index.txt` and an EQG asset-list file. No required support file may produce Failed to fetch. Navigate the first-person viewer, exit pointer lock with Escape and return to Map. Hiding Map must release the extra scene; showing it remains recoverable.
4. In Intel, scroll a long list while Item Level Slider and My Class remain visible. Changing tier updates the same saved main-app slider and drop stats. Dragging must survive session heartbeats.
5. Hover/focus a mob name, move onto its actions and activate Details/Route/Copy/Wiki/Map. Controls stay reachable across the gap. Each Map action opens the correct normal/raid source in first person without moving the logged player marker or route start. No global Intel Map button remains.
6. Change zones/folders while 3D loads, reload/hide/show the panel and enable/restore Ignore mouse. No stale camera target or scene may appear. Compare known-Z and unknown-Z markers against the selected slice.

GitHub synthetic tests complement this physical pointer-lock, game-focus and real-archive checklist. The owner's installed app is left unchanged unless they request an upgrade.

## 0b. Main window and Local Map

1. Resize/move the main window onto a second monitor, restart, and confirm its normal bounds return. Repeat maximized; Restore must return to the prior normal bounds. Pin to top must be absent; the main window must have ordinary stacking behavior.
2. Enable **Minimize to tray**, minimize, and restore with the existing tray's **Open Eye of Zomm**. With the preference off, minimizing must retain taskbar recovery. Explicit tray Quit must exit all windows.
3. Enable **Start minimized**, restart, and recover through the tray or taskbar according to Minimize to tray. Both preferences must persist independently. Disable both when finished.
4. Disconnect the saved monitor, relaunch, and check the complete title bar remains reachable on a connected display. Repeat physical 100/125/150% scaling and monitor moves.
5. Open Live Map in a short, non-maximized window. The viewer footer/note, route status and controls must fit or scroll into view. Check First/Top/Map and Local Map at each scale.
6. Zoom the embedded Local Map with +/− and its wheel, reset, move through later `/loc` updates and change views. Native Map zoom must still work independently. Switching zones resets the Local Map zoom.
7. Change the native Map Z slider and tolerance. Unknown-Z NPCs remain visible on every floor; known-Z NPCs appear within the selected band. Check Raid Zone comes first in Intel without mixing its drops with Normal Zone.
8. Open **What's new** in Settings. Verify every screenshot loads, Previous/Next and keyboard Escape work, and each Open action goes to the named main page. Follow **Eye of Zomm on GitHub**; it must open the exact repository in the normal browser. Restart must not open the tour automatically.

The automated display/renderer tests complement these physical monitor and game checks; they do not establish them.

## 0. Application updater acceptance

Application updates are separate from Sync with Wiki. From 0.8.9 a new verified
download starts a cancellable five-second countdown to a silent NSIS upgrade
and automatic relaunch. A previously staged package retains the explicit
restart action. An older
installed build retains its own installer flow for the first upgrade.
Record its folder/log choices, preferences and cached wiki-data state; verify
those are retained after the normal NSIS upgrade. A future approved newer build
is needed to prove the complete in-app updater path without changing production
release metadata for a test.

In a controlled Windows test, check that the correct new version is offered,
Release notes opens only this repository, download progress/cancellation work,
**Restarting in 5** appears after a new verified download, and **Cancel restart**
preserves the staged package after relaunch. Reopening with a staged package
must not trigger another countdown. Automatic download defaults off; when
explicitly enabled, a newly completed startup download should also count down.
Allow the countdown to finish, or choose **Restart to install update** on a
previously staged package: no extra app confirmation or setup wizard should
appear. EoZ closes after Windows accepts the installer
launch, the silent upgrade finishes, and the correct version relaunches with
the same profile/cache/log choices and install directory. Test a directory
containing spaces. Windows may still show its own security/elevation prompt.
Use disposable EoZ test profiles to test changed/missing staged installer recovery
and Windows launch failure. Game files must never change. Hash verification does
not establish Authenticode signing; record signature status separately.

## 0a. Native overlay and timer acceptance

1. Open **Overlays**. Confirm Parse, Map, Zone & loot and Timers are separate
   desktop windows that can sit outside the main app. Unlock, move and resize
   each, then lock; tabs, dropdowns, keyboard and hover menus must still work.
2. Adjust background opacity/font scale. Text must remain readable. Hide/show
   panels independently; restart EoZ and confirm bounds, visibility and settings.
3. With the game foreground, enable Ignore mouse and click through each panel.
   Restore input from tray/main controls and Ctrl+Shift+O if registered. A shortcut
   conflict must be disclosed. Verify no game input is generated by EoZ.
4. Close main with visible panels. Continue combat, loot and considers: all
   panels must follow one session. Reload/hide/reopen a panel without duplicate
   counts. Tray Open restores main; tray Quit closes every process/window.
5. Repeat at 100/125/150% OS scaling, across monitors and after monitor removal.
   Saved bounds must remain reachable; Reset positions restores input/layout.
   Check real game foreground focus behavior in both locked and unlocked modes.
6. On the main **Timers** page, add manual/repeating and literal/regex log-trigger timers. Pause/resume/reset,
   restart EoZ and sleep/wake: absolute deadlines remain accurate. Confirm zone
   filters, one-time latest-kill reminders and supplied durations; a reminder is
   not evidence of a spawn. Initial tails, stale/replayed or timestamp-free text
   cannot start timers. Normal parse history must still populate.
   Test PNUT-style `(?P<name>...)` captures, previewed matches and capture-based
   display labels; duplicate/edit/disable rules, overlap and cooldown choices.
   Verify warning/end colors and optional sound/speech, notifications without a
   countdown, and a pathological regex timing out without freezing the app.
7. Confirm the native timer panel has only ring/label/countdown rows and a thin
   swing bar; configuration opens the main Timers page. Parse has exactly
   Overview, Damage, Healing, Taken, Session; no duplicate View toolbar or
   permanent explanatory status chrome. Verify own incoming melee/spell/DoT
   damage in Taken, excluding other players, pets, rune capacity and misses.
8. Compare swing learning to own hits/misses, multi-attacks in one second,
   specials, casts/interruption, idle gaps and haste/weapon changes. The bar must
   wait at full for a real attack, never cycle independently. Check Delay 36
   seeds 3.6s after a real swing; 0 learns automatically. Record unsupported log
   wording without weakening own-action or timestamp guards.
9. Confirm stale/crashed owner status disables session actions. Explicit Open
   main recovers it; saved timer deadlines remain, parse history is rebuilt from
   the tail. Verify NPC/waypoint/wiki actions remain current-zone scoped and
   Route respects the user's path-controls opt-in.

The synthetic Electron test exercises native windows, IPC, DOM and session
continuity; it does not click through a foreground game or prove physical DPI,
sleep or monitor-removal behavior. See [PNUT_UX_PLAN.md](PNUT_UX_PLAN.md).

For the 0.8.1 integration fixes, select a wiki-only named NPC and verify its
marker and route destination coincide. Move and issue a later `/loc`; the same
destination must route from the new start. Cancel during calculation, then issue
another `/loc`; the cancelled destination must stay cleared. Repeat in First,
Top, and Map. Compare bow/throwing Range tiers against the wiki, and after the
reviewed server catalog is installed and rebuilt, confirm Kael Drakkel and
Neriak NPCs populate their current-zone lists. See the
[integration audit](INTEGRATION_AUDIT.md) for deployment and evidence limits.

The [October 21 local-archive validation](MAP_VALIDATION.md) covers rendered
routes, textures, synthetic log integration, and emulated renderer scales.
It does not replace the live movement, Windows DPI, and installer checks below.

## 1. Continuous `/loc` tracking

1. Choose the EverQuest folder once, enter Befallen, and emit `/loc -961.00, -30.00, -66.00` near that exact logged location.
2. Confirm the viewer HUD and sync status match the in-game Map window's explicit `X / Y / Z` labels while the marker occupies the same room. The corresponding client-map anchor X `30`, Y `961`, Z `-66` must converge on that same viewer point; that internal signed basis must not appear as a competing player location. The earlier checklist transposed this Befallen fixture; local archive/map bounds confirm the corrected anchor. The shared coordinate transform is unchanged.
3. In Mistmoore, run `/who`. Without zoning again, confirm `ZONE: The Castle of Mistmoore 1595 (mistmoore)` on the current character's row selects **Mistmoore Castle**; another listed player's row must not become the active profile or trigger a second reload.
4. Repeat the reported side-by-side check near Map `X -222.75, Y 125.50, Z -154.10`. The app HUD/footer must show `X -222.75  Y 125.50  Z -154.10`, and its arrow must occupy the same map feature as the in-game arrow.
5. Repeat near game `/loc -330.00, 120.00, -178.13`. The marker must land around the real client-map-file Succor anchor X `-120`, Y `330`, Z `-180` and remain on that same map point while switching views.
6. Bind `/loc` to the movement keys used for the test, then move forward, stop, strafe, and reverse.
7. Confirm the player position follows without pressing an app Sync control, duplicate lines do not spin the arrow, and turns settle to the new movement heading.
8. Repeat in First, Top, and Map modes. The selected mode must not flash through or fall back to First during updates.

Pass: tracking remains responsive during sustained movement, the latest position wins when log lines arrive in a burst, the visible coordinates always match game `/loc`, and the explicit world/client-map adapters meet at the same viewer anchor in every presentation.

## 2. Rare-mob replacement map

1. Load a zone with EQLWiki NPC coordinates and known loot.
2. Confirm named/rare labels appear over the 3D scene and aligned local map, with class-relevant loot counts favored when labels compete for space.
3. Change First/Top/Map and move/zoom the camera; labels must stay anchored and declutter rather than overlap wholesale. Open the Z icon, lower the cutoff, and confirm geometry above that elevation hides without changing the selected view.
4. Click a rare label. Confirm it becomes the active destination and produces either a golden collision-valid path, a destination marker, or a specific missing-route explanation.
5. Clear the route and confirm the destination highlight disappears.
6. Start another route, press **Cancel path** while it calculates, then move far enough to normally trigger re-routing. Confirm the destination remains cleared and calculation does not restart.

Pass: the player can identify and start navigating to an interesting current-zone target without opening the in-game map or typing its name.

## 3. Native Intel and map browsing

1. Show Zone & loot and Map as independent native windows. Minimal mode and a separate Consider window must be absent.
2. Verify **Normal Zone** and slightly red **Raid Zone** sections. Same-name normal/raid sources must retain their own drops, source flags and destinations.
3. Search by named mob, toggle **My Class**, and verify selected tier, distance and item details. Class-filtered loot excludes statless/weight-only items.
4. On a mob with more than five matching drops, **Show More** must reveal every matching item; **Show Less** must survive subsequent session snapshots. Repeat after class/era/tier/zone/data refresh to reject stale cached drops.
5. Consider and kill a listed named mob. Its Intel row must select, scroll and expand with a mild flash/blip; reduced-motion mode suppresses animation. The game must retain OS focus. No Consider popup opens.
6. Copy `/waypoint Y X [Z]` and verify coordinate order in a safe text field. Route respects the routing opt-in and keeps the native workspace active; opening full details is explicit.
7. Check the native Map's client line geometry, labels, current location, floors, follow and zoom. A shared validated route/selected source must agree with the full Map Explorer. First/Top/Map controls appear only on the main Map page.
8. In Items, **Through era** includes the chosen era and earlier eras. Options must correspond to eras present in this pack. Compare known Classic-only and later-era items and verify selection survives view changes.

Pass: independent map/intel windows retain filters and source identity, show all requested drops and react to named events without stealing game focus.

### Missing-wiki notices in Timers/Triggers

Use a controlled complete-catalog fixture or a verified missing entity; older or
sample packs cannot establish absence. A fresh missing monster/item event must
show a notice inside Timers, never a new popup. Visible interactive native Timers
takes priority; hiding it or enabling mouse passthrough falls back to main Timers.
There must not be two competing notice clocks. It lasts 15 visible
seconds, pauses while hovered or keyboard-focused, and queues beyond four cards.
Screenshot offers a local window/display choice. Verify a disappearing source
can be reselected, successful capture plays a mild shutter, and the notice says
**Paste your clipboard into discord!**. Paste into a safe local image target to
verify the clipboard; no upload occurs. Ignore suppresses that entity across
restart. Hidden main pages and hidden native windows must preserve unseen time.
Inspect screenshots yourself before sharing any game/player content.

## 4. Map Overlay versus S3D textures

1. In **Map**, confirm the app shows the client's `.txt` line map on the high-contrast map canvas; S3D wall/floor textures are intentionally not drawn in this presentation.
2. Switch to **First** and **Top**. Confirm decoded S3D walls/floors use zone textures rather than widespread flat placeholders.
3. In Mistmoore, inspect the reported castle corridors closely. Textures must tile across large polygons; a narrow texture strip stretched into a gray/black face fails.
4. Repeat in one outdoor S3D zone. If either zone is untextured, export redacted diagnostics and record the `viewer.textures` available/material/resolved counts with the zone short name.

Pass: line art is limited to Map presentation, First/Top resolve expected S3D textures, and a failure produces useful counts without exposing paths.

## 5. Persistent golden path

1. Route to a known current-zone named mob.
2. Start the route separately from First Person, Top Down, and Map Overlay. Confirm selection and the entire calculation retain the chosen presentation, then confirm the golden path is visible in all three.
3. Move continuously for more than eight units while `/loc` is bound to movement.
4. Confirm the destination remains selected and the path eventually updates from the newest position instead of waiting indefinitely for movement to stop.
5. In a stacked-floor zone, inspect the full route for wall cuts, floor fall-through, or an ascent greater than +6 Z without a legal ramp.
6. While a long route is being found, drag/zoom/switch view and continue moving. The window must remain responsive; route graph generation may not freeze rendering or input.

Pass: route work does not block position updates, the line is never presented as valid when collision validation fails, and continuous `/loc` traffic cannot starve re-routing.

## 5b. Guarded spatial candidate and fallback

Use Settings → **Export redacted diagnostics** after each case below. The candidate is deliberately invisible as a named engine in normal UI; use `viewer.spatial` in the JSON to distinguish it from the established route.

1. Run one route in each category: outdoor open terrain, narrow indoor corridor, stacked-floor stairs, legal ramp, closed door or solid wall, exposed downward drop, and the same drop attempted in reverse.
2. Start with a route already visible. While the candidate state is `waiting-geometry`, `preparing`, or `calculating`, drag, zoom, change First/Top/Map, open loot, and continue producing `/loc`. The existing line must stay visible and input must remain responsive.
3. For a successful candidate, confirm `viewer.spatial.collision.status` and `viewer.spatial.candidate.status` are `ready`, triangle counts are non-zero, timings are finite, and the displayed line changes without moving the camera, clearing the destination, changing the Z slice, or interrupting the cue HUD.
4. For the closed door/wall and reverse-drop cases, confirm no line crosses the barrier or turns the drop into an ascent. A `fallback` or `no-path` candidate is acceptable only when the established route/marker remains honest and usable.
5. Start a long route, immediately choose another mob, then change zones. Confirm no earlier candidate reappears. Repeat with **Cancel path**; movement must not restart the cancelled destination.
6. Test at 100%, 125%, and 150% Windows scaling in at least one indoor and one outdoor zone. Record collision export, crop, generation, query, and total timing values plus whether interaction visibly stalled.

Pass: all displayed candidate segments remain on the intended walkable surface, upward movement never exceeds +6 Z without a gradual surface, drops are one-way, stale work never wins, and every candidate failure preserves the established valid route or honest marker. Do not promote the candidate to first-choice routing until this entire matrix passes.

## 5a. Fly-first viewer chrome and Succor reset

1. Confirm the embedded viewer has one control row, with **Reset** immediately after **Load Zone**, a single **Z** button, and no Grounded or Floors control.
2. Enter First Person. No center-screen click-to-enter panel may cover the scene; clicking the map should capture mouselook and WASD should fly immediately.
3. Move away from the safe point in First, press **Reset**, and confirm the camera returns to the map label containing `Succor` or `Safe Point`.
4. Repeat Reset in Top and Map. The current presentation must remain selected and center on the same safe point.

Pass: the map maximizes usable height, Fly is the only navigation mode, Z clipping is discoverable but compact, and Reset has the same spatial meaning in every presentation.

## 6. Live route cues and redacted diagnostics

1. Follow a route with at least one obvious turn. Confirm the viewer HUD and route status show decreasing remaining distance and the same next-turn direction.
2. Face away from the path, return to it, then move more than 30 units away. Confirm cues distinguish facing recovery, off-route recovery, and normal progress without hiding the golden line.
3. Repeat in First, Top, and Map. Confirm the cue remains readable and does not take map controls or marker clicks.
4. In Settings, export redacted diagnostics. Open the JSON and confirm it contains route/map readiness plus aggregate `viewer.spatial` counts/timings/outcomes, but no character or target name, player/route coordinates, raw worker error detail, EQ/log path, log filename, or log contents.

Pass: guidance agrees with the displayed path while live movement updates it, and the exported file is useful without exposing identity or local filesystem details.

## 7. Retained v0.6 gates

Run the v0.6 checks for folder/log persistence, zone textures, Legends rare-creature considers, item relevance and tier tooltips, pin/taskbar behavior, combat grouping, observed drops, and the Windows installer.

## Release decision

Do not promote the guarded candidate to first-choice routing if texture fidelity, mode preservation, signed coordinates, heading stability, rare-marker alignment, minimal loot browsing, continuous-movement refresh, stale-work safety, input responsiveness, or any spatial case fails. A route may fail only with an honest marker/reason; an invalid displayed route is always release-blocking.
