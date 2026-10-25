// Version-owned captures and reviewed hashes are immutable; see docs/RELEASE_HISTORY.md.
const freeze = value => { if(value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const RELEASE_HISTORY = freeze([
{
  "version": "0.9.15",
  "title": "Verified discoveries, zones and map controls",
  "changes": [
    "Check the public live wiki before showing an automatic discovery, item gap or monster popup. Use the bundled snapshot to avoid checks for known facts. Keep pending, failed, broad, unsupported and inconclusive checks out of the discovery queue and popups; recheck current facts before publication.",
    "Reuse temporarily cached public wiki entries, including their direct zone and loot data, until the shipped snapshot reaches that revision. Share the cache across item presence, gap verification and local views; expire absence verdicts quickly and refresh old source proof without treating temporary facts as global loot-count completeness.",
    "Dismiss an individual discovery with its red ×, or use ∞× to ignore that exact NPC or item across future contribution attempts. Restore ignored entities from Contribution History, including while signed out. Device ignores persist across restarts and dataset updates; existing submission receipts remain available.",
    "Preserve readable zone names from entry logs and self /who records, including Lake Nerius. Export canonical public zones beyond the curated map catalog and retain documented NPC zone/category facts. Empty cache metadata no longer proves a wiki gap.",
    "Recover explicit numeric /con levels from the selected log and the same continuous zone visit. Prefill killed-monster levels as unconfirmed observations with provenance. Considering a monster alone creates no discovery; zone/source/instance changes and older contributor edits are respected.",
    "Create zones from the shared live Zone blueprint with an opening overview and Map, explicit Yes/No/Unknown raid availability, and separate optional raid overview and Raid Map. Validate reviewed map images and keep placeholders when unknown; narrow updates preserve existing zone content.",
    "Restore scoped global loot-count completeness by bounding reviewed unresolved groups without expanding their broad entries or manufacturing drop counts. Research materials remain uncertain; verified important loot can qualify as Unique under the existing six-monster rule.",
    "Keep the 3D player marker visible at full-zone scale, show a movement-derived direction arrow, and make left-drag pan in the top 3D view. Retain explicit rotation controls for the perspective view.",
    "Use an eye mark in the app header and browser icon, styled for the existing dark and gold interface."
  ],
  "steps": [
    {
      "title": "Control discoveries",
      "image": "0.9.15/discovery-controls",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Automatic discoveries appear after a live wiki check confirms the gap. Use the red × to dismiss one entry, or ∞× to ignore its NPC or item until restored.",
      "alt": "Actual isolated Chromium contribution queue showing red dismiss and infinity ignore controls beside synthetic NPC and zone drafts.",
      "caption": "Actual Electron Chromium capture with synthetic drafts, a local shared-blueprint fixture and an isolated profile. The native fixture verifies queue controls, ignore/restore and zone-form behavior. No installed profile, game pixels or production wiki writes.",
      "imageSha256": "4f23fc4b3d3bc592499b2f827c2c5d621ab36b919e7e03e149d6aa7690a23565"
    },
    {
      "title": "Restore ignored NPCs and items",
      "image": "0.9.15/ignored-entities",
      "view": "contribute",
      "action": "Open Contribution History",
      "copy": "Contribution History includes an ignored-entities list for this device. Find an NPC or item and choose Restore to permit future discoveries again. Saved drafts and published receipts are preserved.",
      "alt": "Actual isolated Chromium Contribution History with a synthetic ignored NPC, local search and type filters, and Restore button.",
      "caption": "Actual Electron Chromium capture with synthetic drafts, a local shared-blueprint fixture and an isolated profile. The native fixture verifies queue controls, ignore/restore and zone-form behavior. No installed profile, game pixels or production wiki writes.",
      "imageSha256": "f732b4cb7efe5c08e05dbed3849091b9fb1f945dbf31fc2b1568aef9ec7df2b3"
    },
    {
      "title": "Set up normal and raid zones",
      "image": "0.9.15/zone-creation",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Choose whether the zone has a raid instance. The shared blueprint keeps normal and raid details separate and always includes an overview and Map, with placeholders for facts not yet known.",
      "alt": "Actual isolated Chromium new-zone form showing the explicit raid-instance answer and separate normal and raid overview fields.",
      "caption": "Actual Electron Chromium capture with synthetic drafts, a local shared-blueprint fixture and an isolated profile. The native fixture verifies queue controls, ignore/restore and zone-form behavior. No installed profile, game pixels or production wiki writes.",
      "imageSha256": "eaf30a5c3fc4a3aa07d2addf01c59f0e20f43a57bc43866fc2133608cd927a12"
    },
    {
      "title": "Pan the top 3D map",
      "image": "0.9.15/map-player-arrow",
      "view": "map",
      "action": "Open Map",
      "copy": "Left-drag pans the top 3D view. The location ring stays visible at whole-zone zoom, and movement adds a direction arrow. Use right-drag when you want to rotate.",
      "alt": "Actual native Top 3D map showing a cyan player location ring and movement arrow over a synthetic floor with synthetic NPC labels.",
      "caption": "Actual isolated Electron WebGL map capture after synthetic log location updates through the normal overlay pipeline. Native pointer checks verify camera and target pan together without tilting. No game files, player pixels or installed profile are used.",
      "imageSha256": "02c77898dbb750538c13963179dc56cb3f1ef62765897996f3b74dfe53c74991"
    }
  ]
},
{
  "version": "0.9.14",
  "title": "Contribution history and safer loot discovery",
  "changes": [
    "Ask whether each newly discovered monster is notable. Save explicit Yes/No for its exact draft without opening the main app, keep unanswered location drafts, and edit the choice in Contribute. Stale popup actions cannot replace a newer choice or saved review.",
    "Check existing authored sources on either side before proposing loot edits. Cached positive coverage stays quiet without a live request; exact unscoped sources and verified complete item sets or pools already count. Preserve broad, conditional and unsupported source descriptions for useful review instead of expanding them into redundant individual drops.",
    "Skip routine source enumeration only for positively identified common materials with at least six verified monster sources and no gear, binding, lore, effects or special modifiers. Unknown monsters and potentially important quest or effect items stay available for review; missing metadata cannot prove an item is routine.",
    "Keep Discoveries and Contribution History inside one Contribute section with shared account controls. Use a compact reader toolbar and keep published automatic additions only in History. The discovery queue retains unfinished work and draft edits.",
    "Pause the Contribute-owned screen reader even with pending item requests or a late start. Refresh and view re-entry keep it stopped until an explicit Start or Contribute action; ordinary log processing continues.",
    "Open Contribution History inside Contribute for this device's automatic and reviewed submissions, including partial and unconfirmed outcomes. Filter locally, load older receipts and open saved-page, revision and diff links, or edit the current page on the wiki.",
    "Keep native receipt metadata separate from editable plans, scoped to the signed-in account and bounded on disk. History cannot retry or publish work and excludes raw evidence and credentials.",
    "Exclude explicit owner-labelled pets from monster discoveries and contribution plans while preserving ordinary monster names and existing edited or submitted work.",
    "Choose Common Loot at six or more distinct monsters across the cached wiki dataset. Choose Unique below six only with complete count provenance; incomplete counts stay for review. Native pack verification makes no live counter requests.",
    "Correct positive primary-stat flooring with shared wiki rules revision 2. Base HP 50 shows 75 at rank 5 with 4/32 progress; reverse recovery uses the same corrected formula and older saved recovery reviews require review.",
    "Count AC, HP, Mana, Endurance and regeneration toward the two-stat requirement for rank-based Void. Weapon damage, Backstab, Haste and Attack remain outside the qualifying stat list.",
    "Add Any immediately before Auto in Items. Browse every class without changing the detected character classes or the other class-filtered panels.",
    "Publish a genuinely new supported loot fact once on the existing monster page, with no reciprocal item-page mirror. Independently summarize verified Unique gear only in a supported existing zone Unique Items row. Preserve Normal/Raid boundaries, curated sets and broad descriptions; uncertain saved writes retain truthful partial History.",
    "Use the same 350 ms pointer-hover delay for item previews in Items, Character and Intel. Keyboard focus stays immediate; moving away, scrolling or changing the source cancels a pending preview.",
    "Keep the Intel list intact on unrelated session heartbeats and update distance labels in place. Avoid repeated row geometry reads during ordinary scrolling while preserving focus and anchors when displayed loot changes.",
    "Restore native Map startup by allowing its two bundled shared item-scaling scripts through the local request policy.",
    "Show wiki suggestions in a separate lower-right desktop popup, even with Timers closed. Check cached item presence first, then bounded public existence; failed or stale lookups never claim a page is missing. Only explicit actions start the contribution workflow."
  ],
  "steps": [
    {
      "title": "Review discoveries in one Contribute section",
      "image": "0.9.14/contribute",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Discoveries and Contribution History share the Contribute header and account controls. The compact item reader sits above the discovery queue and editor. Pause reading when needed; opening History pauses the owned reader and preserves your draft. Complete submission receipts live in History.",
      "alt": "Actual Contribute section with embedded Discoveries and Contribution History tabs, compact item-reader toolbar, discovery queue and synthetic item editor.",
      "caption": "Actual isolated Electron Chromium capture of the current workspace and styles with synthetic sources and generated screenshot pixels. The native fixture checks reader ownership, draft edits, automatic result processing and History tab pausing. No installed profile, game pixels or wiki writes.",
      "imageSha256": "78e49592b008eb22719d218fed2b32fe0663efd7904da5eebfb067ad8e3cb392"
    },
    {
      "title": "Review automatic and manual wiki submissions",
      "image": "0.9.14/contribution-history",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Open History inside Contribute to see this device's submissions for your signed-in wiki account. Inspect saved pages, partial work and unconfirmed results, filter locally, or load older receipts. Page, saved revision and diff links show confirmed results. Edit on wiki opens the current page editor for a correction. Published automatic additions leave the discovery queue; History never retries an old plan.",
      "alt": "Contribute History with synthetic Published, Partly published and Needs attention receipts, local filters, and an expanded partial result with page, saved revision, diff and Edit on wiki links.",
      "caption": "Actual isolated Electron Chromium capture of the integrated Contribute section and embedded History tab with synthetic receipts and isolated wiki/storage APIs. No game/player pixels, installed profiles or production wiki submissions.",
      "imageSha256": "a04f625bee8bf20cf1e314236206007aad3eade1a3b8e171f9884776830ed393"
    },
    {
      "title": "Act on wiki suggestions outside Timers",
      "image": "0.9.14/wiki-discovery",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Verified missing-item suggestions stack in a separate lower-right desktop popup. Timers can stay closed. Notices stay for 15 seconds of visible time; completed capture also has a full 15-second confirmation. Ignore a suggestion or choose Contribute to open its reader workflow; receiving a notice does not start capture or move focus.",
      "alt": "Two standalone wiki suggestion cards for synthetic missing items, each with Contribute, Ignore and dismiss controls.",
      "caption": "Actual isolated Electron native-window capture of the current notice modules and styles with synthetic data. Native fixture receipts verify work-area placement, no initial focus change, no Timers window, explicit actions and expiry. No installed player profile, game pixels, live wiki requests or production edits.",
      "imageSha256": "0da34ad25e5cefe28584286551f08d07e7dcbe231c15877a124705f2f830afb2"
    },
    {
      "title": "Choose whether a new monster is notable",
      "image": "0.9.14/new-monster-notable",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "The new-monster popup asks whether that monster is notable. Choose Yes or No to save the answer for its draft without opening the main app. Leave it unanswered to keep collecting its spawn location, or revise the choice in Contribute. A page template never decides the answer automatically.",
      "alt": "Actual native new-monster popup for a synthetic guardian with an unanswered notable question, explicit Yes and No buttons, spawn-location guidance and Contribute, Ignore and dismiss controls.",
      "caption": "Actual isolated Electron native-window capture with synthetic monster text. The sandboxed fixture checks literal names, no initial focus change, native Yes and keyboard No with durable queue acknowledgement, stale-request protection, hover expiry and the next-/loc flow. No installed profile, game pixels, live wiki requests or production edits.",
      "imageSha256": "daf2fd0fd5eb3a2952824c0a8cd0b1ec1fa337bf7e2e9bb3c0d8a8bbe464b41f"
    }
  ]
},
{
  "version": "0.9.13",
  "title": "Correct tier-zero verification category",
  "changes": [
    "Use the exact wiki category title Tier 0 Verification Needed when creating items with unverified ranked or recovered base values.",
    "Recognize app-marked category membership in either capitalization when a reviewed tier-zero reading clears it. Preserve manually assigned categories."
  ],
  "steps": [
    {
      "title": "Review the canonical verification category",
      "image": "0.9.13/category-title",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Item pages with unverified ranked or recovered base values include [[Category:Tier 0 Verification Needed]]. Review it in the proposed wikicode alongside the tier-zero verification note. The exact title matches the wiki category. A later accepted tier-zero reading can remove app-marked membership without removing categories added manually.",
      "alt": "Actual contribution review of a synthetic ranked item, with the After wikicode scrolled to Category:Tier 0 Verification Needed.",
      "caption": "Actual current contribution saved-plan review in isolated Electron Chromium, with a synthetic ranked item, synthetic account and local wiki bridge. The draft is generated by the real contribution model; the After field is scrolled to its category. No game/player pixels, production requests or publication.",
      "imageSha256": "61f997979debdf36b1c3e113b94d9d1c072c0099f9ac5a11c1a9091aaf5081ce"
    }
  ]
},
{
  "version": "0.9.12",
  "title": "Shared wiki item formulas and tier-zero verification",
  "changes": [
    "Use the wiki-owned item calculation engine and revisioned rules for every item-tier preview. Match wiki Backstab, weapon Accuracy, Void resist, weight and tier limits while preserving recorded Character totals.",
    "Bundle one formula snapshot in each app release. Windows and Linux use the same release-time wiki source; formula changes arrive with app updates without background formula requests.",
    "Add new item pages based on unverified ranked or recovered values to Category:Tier 0 verification needed, alongside their verification note."
  ],
  "steps": [
    {
      "title": "Preview item tiers with the wiki formulas",
      "image": "0.9.12/shared-item-formulas",
      "view": "character",
      "action": "Open Character",
      "copy": "Hover equipped gear and adjust Item tier directly below its name. The shared wiki engine supplies green adjusted values, including Backstab, Accuracy and Void resist. The app keeps its bundled formula snapshot until the next app update; recorded Character totals stay unchanged. New item pages with unverified tier-zero values also appear in the wiki verification category.",
      "alt": "Actual Character item tooltip for a synthetic tier-five piercing weapon, with its tier slider, green Backstab 15, Accuracy plus 12.5 percent and SV Void plus 5.",
      "caption": "Actual current Character tooltip rendered in isolated Electron Chromium from synthetic catalog data, with the shared wiki frame and 1.25 text scale. No icon artwork, game/player pixels or production requests. The fixture verifies the shown green values and unchanged recorded HP of 4321.",
      "imageSha256": "e493aabc1a7d31abba0a30266def84f598c99bd9b39930af9546af4a41feab2a"
    }
  ]
},
{
  "version": "0.9.11",
  "title": "Automatic contribution reading and chat item detection",
  "changes": [
    "Start gentle local item reading when Contribute opens, with a selected-item examine prompt, inline source choice and Pause/Retry. Preserve Character and preexisting readers.",
    "Automatically create eligible new item pages after fresh examine proof and live duplicate checks. Append new loot sources from actual native logs, preserving prior sources and using canonical or unique confident fuzzy page matches. Keep ambiguous cases for review.",
    "Fill unedited proposals from fresh matching examine text. Stage a detected item screenshot from its exact accepted frame and offer local icon matches when available. Manual fields and existing images stay intact.",
    "Recognize conservative tier-decorated chat mentions when the game strips link codes. Keep duplicate suppression and label these as possible items without inventing loot sources."
  ],
  "steps": [
    {
      "title": "Open Contribute and examine the selected item",
      "image": "0.9.11/contribute-auto",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Contribute starts reading a safe game window about once per second, or offers a source choice. Open the selected item’s complete examine window. Fresh matching text fills proposals; detected item crops can stage a screenshot and suggest icon matches. Pause in place. Eligible new items publish after live duplicate checks; ambiguous readings keep the review flow. Fresh loot logs can append sources while preserving previous drops.",
      "alt": "Contribute editor with a selected synthetic item, active one-second reader, named examine prompt, Pause control and a staged synthetic screenshot beside the icon field.",
      "caption": "Actual Chromium contribution component with synthetic sources, item text and purple placeholder image, isolated storage/APIs and Arial13px. The icon ID shown was manually entered to verify edit preservation. No game/player pixels or production wiki requests.",
      "imageSha256": "aafc551677d9142fd9e06efafe31fe8728ba207b84702b90a2063d2487adf5a6"
    }
  ]
},
{
  "version": "0.9.10",
  "title": "Reliable overlays and streamlined wiki contributions",
  "changes": [
    "Gently drag snapped overlays to detach without resizing or moving neighbors. Dock only on release near a new edge; the old group cannot pull the panel back during that drag.",
    "Reuse the wiki item frame, inline stats and linked effects throughout the app and native Intel. Preserve green changed values, Character tier controls, compact Exaltation name/effect and recorded-only totals.",
    "Show logged movement direction on the minimap and retain it while stationary. Map opacity applies to the 2D canvas and the complete 3D surface.",
    "Use class/slot multiselects, one Zone, screenshot and inline icon paste, fewer approval steps, explicit destinations and saved-page links. Share a reviewed Character sheet with one final Share action.",
    "Automatically prefill editable compatible base proposals from tiered item evidence, preserve original readings/manual edits and retain the tier-zero verification note. Reject ambiguous weight decimals.",
    "Require kill/death or named-corpse evidence for automatic monster discoveries, preserve the triggering line locally and exclude nearby casts, considers, players and recognized pets.",
    "Offer Contribute for missing wiki items linked in live chat. Accepted notices stay pinned until fresh matching examine OCR or the newly armed next /loc is captured, show green completion, then close. Keep capture ownership and cancellation safe."
  ],
  "steps": [
    {
      "title": "Inspect items with the familiar wiki card",
      "image": "0.9.10/shared-wiki-itembox-main",
      "view": "items",
      "action": "Open Items",
      "copy": "Hover or focus an item in Items, NPCs, loot or Live Map for the same silver wiki frame and compact inline stats. Changed tier values stay green and effects link to their wiki pages. Character uses this frame with its editable tier and Exaltation controls while recorded totals stay unchanged.",
      "alt": "Eye of Zomm 0.9.10 Items page with a synthetic tier-two item in the shared silver wiki-style card and green adjusted values.",
      "caption": "Actual Electron main window with synthetic catalog/log data, an isolated profile and explicit Calibri 17px preference. Visually reviewed; no game/player pixels or production wiki requests.",
      "imageSha256": "3652b5ba013cfe1312e7c2009bb87bc609363935d46c9fde90262c1598164a22"
    },
    {
      "title": "Start with screenshot evidence and the item icon",
      "image": "0.9.10/contribution-screenshot-and-icon",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Item review starts with the screenshot and a compact paste target inside Icon ID. Paste only the icon crop to find artwork locally, then check the destination and proposed additions. Raw evidence stays local until you explicitly include an article screenshot in the reviewed publication.",
      "alt": "Synthetic item contribution with screenshot evidence, adjacent inline Icon ID paste target, destination review and explicit proposed page links.",
      "caption": "Actual integrated Chromium contribution component with synthetic records, isolated APIs and a one-pixel screenshot placeholder. Visually reviewed; no game/player pixels or production uploads.",
      "imageSha256": "324421569f9539e0d7c5281bc48354ef30d90115aeb1645e2783e57c0e3bea45"
    },
    {
      "title": "Choose classes and equipment slots without typos",
      "image": "0.9.10/contribution-multiselects",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Classes and Equipment slots use multiselect dropdowns. Drop sources reuse the Zone above. Tiered evidence prefills editable compatible base proposals. Preview all page changes, check I reviewed these page changes once above Publish, then publish; saved pages offer direct links.",
      "alt": "Synthetic item form with open equipment multiselect, selected Primary and Secondary slots, class choices, linked proc field and a source form without a duplicate Zone input.",
      "caption": "Actual integrated Chromium form at ordinary text size with synthetic evidence and isolated wiki/storage APIs. Keyboard choices, canonical persistence, layout and final review are fixture-tested; physical game and production writes remain separate acceptance.",
      "imageSha256": "7a1bff9ae1d92e00920ad3f9a125f8402fd18afbeb1f5ba68b1f63b5d39f519e"
    },
    {
      "title": "Keep the same item details beside the game",
      "image": "0.9.10/shared-wiki-itembox-intel",
      "view": "settings",
      "action": "Open overlay settings",
      "copy": "Native Zone & loot uses the same item frame and green adjusted values as the main app. Unlock panels to arrange them: a gentle drag detaches the selected window without resizing it or shifting its neighbors. Release close to a new panel edge to dock, or leave it freely positioned.",
      "alt": "Native Zone and loot overlay showing the same synthetic tier-two item and shared wiki-style tooltip at an installed-font preference.",
      "caption": "Actual Electron Intel overlay with synthetic records and an isolated profile at Calibri 17px. The font fixture also checks all four native panels, reload and process persistence; this is not live-game acceptance.",
      "imageSha256": "b1fb1047ea6c83f3200274e051b05e8f5f3023397cf71547caa25edc6d5ee321"
    }
  ]
},
{
  "version": "0.9.9",
  "title": "Clearer wiki gap reviews and Character controls",
  "changes": [
    "Browse discovery gaps with New Page / Update Page tags and independent category filters. New monsters and items appear before smaller updates.",
    "Choose an existing page from deduplicated vertical cards. Case-forgiving canonical matching and decorated Exaltation/container identities prevent false gaps while real page collisions still need review.",
    "Review specific additions on existing pages instead of the full creation form. Drop-source reviews update item, monster and compatible zone lists together, preserving page formatting and revision guards.",
    "Use a numeric item-tier slider with immediately matching equipment badges. A 350 ms hover pause prevents accidental popups; Exaltations use compact name summaries."
  ],
  "steps": [
    {
      "title": "Choose which wiki gaps to browse",
      "image": "0.9.9/contribution-filtered-queue",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Uncheck gap categories to hide them from the queue. New monsters and items stay above source, population and tier-zero updates. Every entry names its page type and whether it creates or updates a page.",
      "alt": "Synthetic discovery queue with gap filters and clearly tagged new monster, new item and item source update.",
      "caption": "Actual sandboxed Chromium component at 13px Arial with synthetic records and isolated storage/wiki APIs. Visually reviewed; no player pixels or production wiki writes.",
      "imageSha256": "7ba998b0a5eca9d9966ecc53fedf97bab8de09a4373d8fe85b2d87af972603a4"
    },
    {
      "title": "Review the exact source addition",
      "image": "0.9.9/contribution-targeted-source-update",
      "view": "contribute",
      "action": "Open Contribute",
      "copy": "Use this page appears below each deduplicated page title. Existing-item reviews explain the missing source and the item, monster and zone edits. Other optional changes stay collapsed; Submit opens the final reviewed diff.",
      "alt": "Actual synthetic item source review with one destination card, compact additions, source selector and optional extra fields.",
      "caption": "Actual sandboxed Chromium component at 13px Arial with synthetic records and isolated storage/wiki APIs. Visually reviewed; no player pixels or production wiki writes.",
      "imageSha256": "223939b82c07d2e7e1855131e1f627aa1e98eeb7fb3ac10fc44e862745f26dca"
    },
    {
      "title": "Change tier without losing your place",
      "image": "0.9.9/character-hover-tier-and-proc",
      "view": "character",
      "action": "Open Character",
      "copy": "Hold the pointer over gear briefly to inspect it. The numeric tier slider updates the equipment icon badge immediately, keeps keyboard focus and leaves recorded Character totals unchanged. Exaltation summaries show their names without extra stat blocks.",
      "alt": "Actual synthetic Character hover with numeric tier-three slider, matching equipped badge and unchanged recorded game totals.",
      "caption": "Actual sandboxed Chromium component at 13px Arial with synthetic records and isolated storage/wiki APIs. Visually reviewed; no player pixels or production wiki writes.",
      "imageSha256": "f424ccba80ebde5d83e47c93b2ad4673b0e1e7eb269054d2c17cbe0287550a36"
    }
  ]
},
  {
    "version": "0.9.8",
    "title": "Richer Character cards and reviewed wiki contributions",
    "changes": [
      "Adjust an equipped item's tier directly below its hover name. Rich cards keep real effects, cast times and restrictions; Character totals remain the recorded game values.",
      "Prefill attached known Exaltations from inventory export. Unknown socket capacity defaults to five while observed capacity and occupied positions are retained through eight.",
      "Share interactive Character (Server) sheets to your own User page with account, revision and destination guards. Existing talk-page sheets remain intact.",
      "Review contribution matches and task reasons first, including missing-source, population and tier-zero work on existing pages. Generated pets and safe obsolete false positives no longer become new-page work.",
      "A fresh unknown kill prompts for one next spawn /loc without stealing focus. Review loot sections, screenshots and optional missing spell effects before publishing the multi-page diff.",
      "Find exact wiki artwork by pasting a crop containing just the icon. Matching runs locally against the lazy public index and preserves artwork aliases and IDs.",
      "Keep minimal kill/loot observations in a separate durable outbox. While enabled and logged in, due batches sync at most hourly with account-bound acknowledgements and offline retry; no raw logs, chat, paths or screenshots are sent."
    ],
    "steps": [
      {
        "title": "Adjust an equipped item's tier in place",
        "image": "0.9.8/character-hover-tier-and-proc",
        "view": "character",
        "action": "Open Character",
        "copy": "Hover or focus equipped gear. Its tier slider sits directly below its name, with green adjusted preview values, real proc details and Exaltation sockets. Use pointer or keyboard controls without leaving the hover. The recorded character stat panel stays unchanged.",
        "alt": "Synthetic equipped item with a tier-three slider, combat proc, five Exaltation sockets and an unchanged recorded character total.",
        "caption": "Actual Chromium Character component at 13px Arial with synthetic records and isolated storage/APIs. The native fixture changes item tier while recorded HP remains 4321. No player pixels or wiki writes.",
        "imageSha256": "5b8c2089ccfedfd8fd867930c1ec1fed65d74481f3ba394927d1720b1f41acd3"
      },
      {
        "title": "Review page identity before contribution details",
        "image": "0.9.8/contribution-matching-and-loot",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Start with potential existing pages and the contribution type. Confirm the identity, choose the zone and Raid Instance when appropriate, and correct readable page details. A saved spawn location remains a proposal for the final wiki diff. Individual fields no longer need Verified checkboxes.",
        "alt": "Actual Contribute component showing potential matches, identity review, era, instance and readable NPC page details using synthetic data.",
        "caption": "Actual Chromium Contribute component at 13px Arial with synthetic queue records and isolated fake wiki replies. This shows match/page details, not a production edit or a live spawn capture.",
        "imageSha256": "0f262668873b01ff566f863dce294b9b696108bd5b59037e9ff7f2319db1292b"
      },
      {
        "title": "Classify loot and choose a screenshot",
        "image": "0.9.8/contribution-loot-controls",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Use Common Loot and Unique Loot to select the wiki sections for observed drops. Add another item by title, then select or paste a screenshot into the plus area. Caption and rights remain editable. Submit first opens the reviewed wiki changes; these controls never publish on capture.",
        "alt": "Synthetic loot rows with Common Loot and Unique Loot buttons above the screenshot plus area, caption and image rights.",
        "caption": "Actual Chromium Contribute component at 13px Arial with synthetic loot and isolated storage/APIs. Common/Unique are page sections, not measured drop probabilities. No production writes or uploads.",
        "imageSha256": "b0d7b5929187ed743046c68346fa25f1443ff7e02a8aa38b15b95a53290d606d"
      },
      {
        "title": "Review screenshot and item effect evidence",
        "image": "0.9.8/contribution-screenshot-and-icon",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Review the item's effect, required level and Exaltation capacity, then inspect the selected screenshot, caption and rights. Replace or remove the image before preparing the plan. Expand Icon Finder for artwork selection; a separate tour step shows its local matching results.",
        "alt": "Synthetic item effect fields, five Exaltation slots, selected screenshot placeholder, caption, rights and collapsed Icon Finder controls.",
        "caption": "Actual Chromium Contribute component at 13px Arial. The selected image is a one-pixel synthetic placeholder; this illustrates attachment controls rather than icon matching or a real item screenshot. No uploads.",
        "imageSha256": "34c5112391fa3a87ba62c5ae05f8f70d735c685a42db6e1e3e693f1b25f13e8c"
      },
      {
        "title": "Match exact wiki artwork locally",
        "image": "0.9.8/wiki-icon-finder-match",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Open Icon Finder on an item draft. Paste or select a crop containing just the icon, compare local matches, and select the exact artwork alias. You can also browse or search icon IDs. Crop pixels stay on your computer; publishing an article screenshot is a separate reviewed action.",
        "alt": "Actual Eye of Zomm Icon Finder component matching synthetic icon pixels and selecting an exact artwork alias.",
        "caption": "Actual sandboxed Chromium component using shared app styling, synthetic PNGs and an isolated local catalog/cache fixture. No player pixels, live wiki images or uploads.",
        "imageSha256": "67a6dcd08e8882aae44cca9d08e215e27302eeb6c15d7c124767c7877c1b8c1b"
      }
    ]
  },
  {
    "version": "0.9.7",
    "title": "Import equipped inventory and record observed stats",
    "changes": [
      "Import equipped gear from /outputfile inventory with automatic character-file detection and a file-picker fallback. Keep every item equipped.",
      "Open Inventory, scroll down, and click off buffs before reading your equipped stat panel. Character totals use only the reviewed game reading, including all Additional Modifiers.",
      "Exaltation export rows fill their parent augment sockets. Missing wiki items leave empty slots; submit them through Contribute and re-export after the wiki updates.",
      "Collect durable unknown item, monster and zone drafts from logs, with observed loot sources and populations. Record a reviewed spawn /loc, paste an item examine, select an icon, and iterate the queue.",
      "Run optional OCR at one frame per second for stable panes. Preserve capture ownership, freshness checks, saved inventories, source recovery and explicit Clear inventory."
    ],
    "steps": [
      {
        "title": "Import equipped inventory",
        "image": "0.9.7/character-inventory-export",
        "view": "character",
        "action": "Open Character",
        "copy": "Keep all gear equipped. Type /outputfile inventory in EverQuest. Eye of Zomm detects a fresh matching character export in your game folder, or lets you choose it. Missing wiki items leave their exported slots empty.",
        "alt": "Import equipped inventory using synthetic character records in the actual Eye of Zomm component.",
        "caption": "Actual native Character component at 13px in an isolated synthetic profile, with fake capture and file APIs. No player or game pixels.",
        "imageSha256": "409ab0998d6cb9eed7bf53765c056060edf453d647ede7e6f9340531a54ae65d"
      },
      {
        "title": "Prepare the recorded stat panel",
        "image": "0.9.7/character-recorded-stats",
        "view": "character",
        "action": "Open Character",
        "copy": "Open your Inventory. Scroll down to show the full stat panel and Additional Modifiers. Click off your buffs. Keep all gear equipped, choose the game window and read its displayed stats.",
        "alt": "Prepare the recorded stat panel using synthetic character records in the actual Eye of Zomm component.",
        "caption": "Actual native Character component at 13px in an isolated synthetic profile, with fake capture and file APIs. No player or game pixels.",
        "imageSha256": "272b8580467e232492565d7ad5a44fdd42c2c3252ece65a557aebc6bec774820"
      },
      {
        "title": "Share recorded character totals",
        "image": "0.9.7/character-imported-inspect",
        "view": "character",
        "action": "Open Character",
        "copy": "Review one equipped total panel. Item, augment, tier and old baseline values are never added to it. Save your known gear and recorded stats or share an interactive Character (Server) sheet on your wiki talk page.",
        "alt": "Share recorded character totals using synthetic character records in the actual Eye of Zomm component.",
        "caption": "Actual native Character component at 13px in an isolated synthetic profile, with fake capture and file APIs. No player or game pixels.",
        "imageSha256": "c5ea70f4c5e8f5f3920ee81889cc19a7041ef9fca2f2b48df3524fc63f64b23e"
      },
      {
        "title": "Work through log discoveries",
        "image": "0.9.7/contribution-log-discoveries",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Unknown monsters, items and zones accumulate in Contribute while logs are followed, even with screen reading off. Review sources, loot and population evidence. For a monster, stand at its spawn, click Record next /loc, and type /loc in the game; verify the proposal before submission.",
        "alt": "Work through log discoveries in the actual main app with synthetic log observations.",
        "caption": "Actual main window/preload at 13px using isolated synthetic logs and local screenshot OCR. Icon 42 is a synthetic placeholder. No player pixels or production wiki writes.",
        "imageSha256": "89c897cf69b9dc260871f5f389145a44e0bd3e198ec4dbbcb40a676ceaae122b"
      },
      {
        "title": "Finish item evidence in Contribute",
        "image": "0.9.7/contribution-item-evidence",
        "view": "contribute",
        "action": "Open Contribute",
        "copy": "Open an item examine and paste its screenshot or choose a PNG here. A tiered read enriches the existing base-item discovery. Select its icon, check potential wiki matches, and preview the reviewed wiki changes. Drafts and evidence survive restarts.",
        "alt": "Finish item evidence in Contribute in the actual main app with synthetic log observations.",
        "caption": "Actual main window/preload at 13px using isolated synthetic logs and local screenshot OCR. Icon 42 is a synthetic placeholder. No player pixels or production wiki writes.",
        "imageSha256": "11e8230336c0fc80b870838fe3bdbebbfa6390ab9d88abcb2ef2007c5fea9b51"
      }
    ]
  },
  {
    "version": "0.9.6",
    "title": "Inspect your character and share it on the wiki",
    "changes": [
      "Use one compact equipment total panel with maximum resources and distinct AC/attack components. Original baseline and observed item values remain private calculation inputs.",
      "Click empty equipment slots for focused compatible wiki search, a tier slider and explicit screenshot paste or file OCR. Unknown screen reads stay in Inventory until matched.",
      "Choose known items and tiers for indexed augment sockets, including weapons in armor. Preserve captured item values and apply socket changes once.",
      "Remove per-item fractional progress and Power Source placement. Retain saved Power Source cards in Inventory and both Any slots.",
      "Share an interactive collapsed Character (Server) sheet with clickable gear and augments. Resharing updates only that character, with account/revision/retry guards and no extra PNG upload."
    ],
    "steps": [
      {
        "title": "One character total panel",
        "image": "0.9.6/character-total-inspect",
        "view": "character",
        "action": "Open Character",
        "copy": "See maximum HP, mana and endurance in a compact inspect below your equipment. AC and attack components remain distinct. Power Source is removed; existing cards return to Inventory. Item tiers remain editable without fractional progress.",
        "alt": "One character total panel using synthetic character records and equipment.",
        "caption": "Actual Eye of Zomm main/preload interface at 13px using an isolated synthetic profile and loopback wiki. No player or game pixels.",
        "imageSha256": "1c816ab11c7938472dc06a7981835e3e34b218b88871cda78d66fa63abc42ab5"
      },
      {
        "title": "Add items from an empty slot",
        "image": "0.9.6/character-empty-slot-picker",
        "view": "character",
        "action": "Open Character",
        "copy": "Click an empty equipment slot to open focused wiki search. Choose the item and adjust its tier before equipping. The picker respects normal slot restrictions; Any slots accept any known item. Paste a screenshot or read a PNG file for local OCR.",
        "alt": "Add items from an empty slot using synthetic character records and equipment.",
        "caption": "Actual Eye of Zomm main/preload interface at 13px using an isolated synthetic profile and loopback wiki. No player or game pixels.",
        "imageSha256": "4f1eee61ed9f382afcc09bd3d6140043b815e6811840944fb3ee4b6fa6285249"
      },
      {
        "title": "Choose items for augment sockets",
        "image": "0.9.6/character-augment-picker",
        "view": "character",
        "action": "Open Character",
        "copy": "Hover equipped or loose gear and click an augment socket to choose a known item and tier. Weapons and armor can both be augments. Captured socket counts and original examine values are retained; changes apply once.",
        "alt": "Choose items for augment sockets using synthetic character records and equipment.",
        "caption": "Actual Eye of Zomm main/preload interface at 13px using an isolated synthetic profile and loopback wiki. No player or game pixels.",
        "imageSha256": "356558d8372403c53310dcd0fae718d23f3bf18267aca8fa444c4aab65ccb3e7"
      },
      {
        "title": "Review an interactive character sheet",
        "image": "0.9.6/character-wiki-share",
        "view": "character",
        "action": "Open Character",
        "copy": "Preview your assigned equipment, augments and totals before sharing to your own wiki talk page. Click gear to open its wiki article. Local PNG copy/save remains available. Raw OCR and loose inventory stay private.",
        "alt": "Review an interactive character sheet using synthetic character records and equipment.",
        "caption": "Actual Eye of Zomm main/preload interface at 13px using an isolated synthetic profile and loopback wiki. No player or game pixels.",
        "imageSha256": "a398a5152f1c03ec6a423aeb6be8f70976ad4af25bc7794646ab9da8e902521a"
      },
      {
        "title": "Inspect linked gear on the wiki",
        "image": "0.9.6/wiki-sheet-inspect",
        "view": "character",
        "action": "Open Character",
        "copy": "Your Character sheet has clickable item icons and tier-specific stat cards with linked augments. Maximum resources and one total panel match the app review. The wiki component and both templates must be installed before sharing is available.",
        "alt": "Inspect linked gear on the wiki using synthetic character records and equipment.",
        "caption": "Actual synthetic component rendered from unsaved MediaWiki parsing, including keyboard/hover checks. This is not a live-site deployment.",
        "imageSha256": "17ab91903a777db1dc070445bd3f71b77843f040f2862e2d8336e4f028b61f19"
      },
      {
        "title": "Keep multiple characters together",
        "image": "0.9.6/wiki-sheets-collapsed",
        "view": "character",
        "action": "Open Character",
        "copy": "Each Character (Server) starts collapsed and expands independently. Sharing the same character again replaces its managed sheet while preserving other characters and unrelated discussion. Revision and retry checks protect concurrent edits.",
        "alt": "Keep multiple characters together using synthetic character records and equipment.",
        "caption": "Actual synthetic component rendered from unsaved MediaWiki parsing, including keyboard/hover checks. This is not a live-site deployment.",
        "imageSha256": "b8047002c86cfe3d3d4564a9a52a4e8c7b25758451c1d71d30f1f1053f4c0251"
      }
    ]
  },
  {
    "version": "0.9.5",
    "title": "Keep your inventory and recover missed item reads",
    "changes": [
      "Use Character Select to switch between Character (Server) saves after their first validated walkthrough step. Each keeps separate inventory, equipment, baseline and progress; switching stops Character reading without automatically restarting it.",
      "Adjust selected-item tier and progress beside its stats, outside Edit captured values. Wiki-based previews show adjusted values in green and retain original captured statistics.",
      "Keep Character inventory, placements and walkthrough state across restarts, upgrades and changed local ports. A new walkthrough retains inventory while rebuilding its placements and baseline.",
      "Reuse one automatic item card across capture sessions and changing tiers. Add extra physical copies with Second copy; choose which saved copy to update when a read is ambiguous.",
      "Use two manual Any slots. Valid slots light up while dragging, and incompatible normal placements are rejected.",
      "Recover removed items during fresh later capture passes or with Rescan removed items. Stale queued reads and the held tooltip remain blocked.",
      "Unequip with the item’s top-right X or by dragging equipped gear back into Inventory. Add item opens and focuses cached wiki search immediately without creating a blank card."
    ],
    "steps": [
      {
        "title": "Adjust tier beside the selected item",
        "image": "0.9.5/character-tier-inventory",
        "view": "character",
        "action": "Open Character",
        "copy": "Select an inventory or equipped item to adjust Item tier and Progress without opening Edit captured values. A tier change previews known wiki base stats, labels that preview and shows changed values in green. Original observed values remain available with Use captured stats. Extra physical copies are manual; screen reads update an existing saved card.",
        "alt": "Synthetic selected Character item with visible tier slider and progress, separate inventory and the advanced editor closed.",
        "caption": "Actual synthetic Character component capture. Native checks exercise trusted keyboard changes, focus and scroll retention, persistence and stat recalculation; no player data or game pixels.",
        "imageSha256": "44c9213172511c3dc03989a8bd4aa49a6b643cba41a446f34c865cff3ade4031"
      },
      {
        "title": "Recover removed items and use Any slots",
        "image": "0.9.5/character-rescan-items",
        "view": "character",
        "action": "Open Character",
        "copy": "If you removed a bad read, choose Rescan removed items and show the complete tooltip again. Only fresh frames after the rescan can recover it. Known items can be placed manually into Any 1 or Any 2; normal slots accept only compatible items. Dragging highlights valid targets, and equipped copies leave loose inventory.",
        "alt": "Synthetic Character walkthrough showing Rescan removed items, saved/equipped/loose counts and the 25-slot equipment board including Any 1 and Any 2.",
        "caption": "Actual synthetic Character component. Native regressions distinguish held or stale reads from a fresh rescan and verify valid drag targets, occupied replacement and strict slot rejection.",
        "imageSha256": "a7dc1fe74fe4a8e38326afd44f566ef014c49c2b9ca4fe636034ba0cfb4e84e6"
      },
      {
        "title": "Choose a saved Character (Server)",
        "image": "0.9.5/character-select-profiles",
        "view": "character",
        "action": "Open Character",
        "copy": "Character Select lists characters after completing the first walkthrough step. Choose New character to begin another, or select a saved Character (Server) to restore its inventory, equipment, baseline and progress. Switching stops the current Character capture; resume explicitly when ready. Same-named characters on different servers remain separate.",
        "alt": "Character Select shows a synthetic Second Realm character, saved re-equip progress and paused screen reading.",
        "caption": "Actual synthetic native Character component. Regressions cover selected-profile isolation, inventory identity, explicit capture ownership and direct search; no player or game pixels.",
        "imageSha256": "c7fa5d4044063c9a863450feb62ae8e5ae0cfd232083e9f0052b4026edfbd6ae"
      },
      {
        "title": "Unequip straight from the equipment board",
        "image": "0.9.5/character-equipped-x",
        "view": "character",
        "action": "Open Character",
        "copy": "Hover or focus an equipped item to reveal its top-right X. Click it, or drag the item back into Inventory, to unequip the same saved physical card. Its values stay intact, and held tooltip rereads do not silently equip it again. Normal slots still reject incompatible items.",
        "alt": "Synthetic equipment board showing an equipped head item with its top-right X and separate loose inventory.",
        "caption": "Actual synthetic native Character component. Regressions cover selected-profile isolation, inventory identity, explicit capture ownership and direct search; no player or game pixels.",
        "imageSha256": "1223e4fdcfbe8ee5130c6ffc7f32db33feb3c92c940d8a50a463a59bee08e8cf"
      },
      {
        "title": "Add item opens wiki search immediately",
        "image": "0.9.5/character-add-item-search",
        "view": "character",
        "action": "Open Character",
        "copy": "Click Add item to open and focus cached wiki search. Type a name, choose the matching item and adjust its tier/progress before adding it. Opening search creates no blank inventory card. Extra physical copies remain deliberate; automatic reads update existing saved items.",
        "alt": "Focused synthetic cached item search opened from Add item, with tier/progress controls and Add to inventory.",
        "caption": "Actual synthetic native Character component. Regressions cover selected-profile isolation, inventory identity, explicit capture ownership and direct search; no player or game pixels.",
        "imageSha256": "3b15faece5e73c2fcad1e6eb1aecfd31545c8d83dde99849017a215fcc50968a"
      }
    ]
  },
  {
    "version": "0.9.4",
    "title": "A compact Character inventory with wiki matching",
    "changes": [
      "Use a compact icon inventory with identity, level, classes, AA count and live equipped estimates beside all 23 equipment slots. Hover or select an item for its stat block.",
      "Show each tier once. Resolve unique bounded OCR spelling errors against the cached wiki catalog; exact names take priority and ambiguous matches need your choice. Keep original observed text and stats.",
      "Keep unmatched reads in loose inventory with a red glow and yellow warning until you choose a wiki match. Only known items can equip, including restored snapshots.",
      "Equipped physical items leave loose inventory and return on unequip. Separate copies, manual corrections and original evidence remain intact.",
      "Unequip slowly, one item at a time, keeping the complete Default Modern tooltip visible until its card appears. Reading continues through review; No Equipment still requires a fresh baseline."
    ],
    "steps": [
      {
        "title": "Arrange gear in a compact Character inventory",
        "image": "0.9.4/character-inventory",
        "view": "character",
        "action": "Open Character",
        "copy": "Your identity, level, classes and AA count sit beside equipped stat estimates and 23 compact slots. Drag an inventory item to a slot, or select it and choose an empty slot. Equipped items leave loose inventory; Unequip returns that same physical card. Hover or select an icon for its stats. Unequip slowly and wait for each complete tooltip to produce a card before moving on.",
        "alt": "Compact Character sheet with synthetic identity, equipped estimates, 23 icon slots and a separate loose inventory.",
        "caption": "Actual Character component at 20 px with a disposable synthetic profile. Equipment placement, loose-card identity, estimates and reload persistence are exercised by the native walkthrough; no game or player pixels.",
        "imageSha256": "a337db29601a4738f9348fe9e8e62a6eb9d0561223b91187721e567296344f67"
      },
      {
        "title": "Match uncertain reads before equipping",
        "image": "0.9.4/character-unmatched-match",
        "view": "character",
        "action": "Open Character",
        "copy": "A yellow ! and red glow mark a read that needs a cached wiki identity. Select it to review potential matches or search by name, then choose Use match. Your captured statistics, tier and original text stay intact. Unique bounded OCR errors can resolve automatically; ties need a choice. An unmatched cache entry does not prove an item is absent from the live wiki.",
        "alt": "Loose inventory with highlighted unmatched items and an open wiki-match search for a synthetic item.",
        "caption": "Actual Character component with synthetic ambiguous names. The native fixture confirms matching preserves observed values and evidence and does not silently equip the item; no production wiki writes.",
        "imageSha256": "60b2ea67fcb2a82b68d3627432670a8ed3dcd61626faa5cecb1b5443d01cf2b2"
      }
    ]
  },
  {
    "version": "0.9.3",
    "title": "Keep reading items through Character review",
    "changes": [
      "Keep capturing missing items during Confirm slots and Save snapshot, until the walkthrough completes or is cancelled. Retain the fresh No Equipment baseline and source/session guards.",
      "Recover repeated reads from the current walkthrough as one physical item card, preserving their evidence and manual corrections.",
      "Automatically locate complete Default Modern tooltip panes, crop and enlarge them for offline OCR, and prioritize their changing pixels over animated scenery. Periodic full-scene reads and manually calibrated areas remain available.",
      "Keep acquiring brief tooltip snapshots while an earlier screenshot is being encoded. Use one local encoder worker to avoid renderer idle stalls. Detect, fingerprint and read each tooltip from the same frozen frame so transitions cannot hide a different item as a duplicate. Temporary snapshots and queued PNGs stay bounded; one offline OCR worker reads them serially.",
      "Keep compact tooltip name and stat rereads when Inventory is also visible. Uncertain OCR text and values remain editable."
    ],
    "steps": [
      {
        "title": "Keep hovering missing items during slot review",
        "image": "0.9.3/character-slots-live-reading",
        "view": "character",
        "action": "Open Character",
        "copy": "Item capture continues through Confirm slots and Save snapshot. Hover over an item missed earlier and keep its complete tooltip visible until its card appears. Earlier queued reads can finish here too. Use Default Modern; review uncertain names and values before saving.",
        "alt": "Character slot confirmation with active reading guidance and a newly captured synthetic item card.",
        "caption": "Actual Character component with a disposable synthetic profile and capture API. Newly captured items appear during slot confirmation; no player data or game pixels.",
        "imageSha256": "3cc3a2625d0e92a027950263cf52291efd555c4118e431fa281e90909eb050be"
      }
    ]
  },
  {
    "version": "0.9.2",
    "title": "Capture brief item tooltips",
    "changes": [
      "Read compact Default Modern hover tooltips as well as full examine panes, including single-word item names and bare equipment-slot labels.",
      "Compare screen changes eight times per second and encode changed frames at most four times per second. One offline OCR worker reads a bounded queue of distinct temporary frames; saturation is reported visibly.",
      "Keep eligible item results when OCR finishes after advancing from unequip or re-equip. Reject stale source/session results and keep the No Equipment baseline fresh.",
      "Read unchanged Inventory stats again after entering the baseline step, without repeatedly adding the same item card. Game-log cursor deduplication is retained.",
      "Show reading and queued-frame feedback inside the walkthrough. Keep each complete tooltip visible until its item card appears. Default Modern remains the calibrated skin; other skins and live composition remain unverified."
    ],
    "steps": [
      {
        "title": "Hover, capture and wait for the card",
        "image": "0.9.2/character-tooltip-capture",
        "view": "character",
        "action": "Open Character",
        "copy": "Use Default Modern. While unequipping or re-equipping, hover each item or open its examine window. Keep the complete name, Class/Race, slot and footer visible until its card appears. Reading status shows a busy frame and how many are waiting. The bounded local queue helps retain brief views; wait for each card when reading is catching up. Valid earlier item frames may finish after Next, while No Equipment requires a fresh reading after confirmation.",
        "alt": "Character unequip walkthrough with three synthetic item cards, automatic equipment slots and reading status showing two frames waiting.",
        "caption": "Actual 0.9.2 Character component with synthetic observations and capture status in a disposable profile. Native stream and offline tooltip OCR are exercised separately; no player pixels.",
        "imageSha256": "46416c79fe7c97e9f273d7d7ba9d62f7406bf2d1d485f099e30c99fb000f2c8c"
      }
    ]
  },
  {
    "version": "0.9.1",
    "title": "Guided character capture and touching overlays",
    "changes": [
      "Build a Character snapshot through one saved walkthrough: details and AA count, inline source setup, unequip/examine, fresh No Equipment review, re-equip, ANY-slot confirmation and preview/save.",
      "Automatically place obvious equipment, keep physical copies distinct and remove inventory cards with their top-right X. Defer ambiguous tier/copy matches and retain catalog search and offline imports.",
      "Calculate equipped estimates from the reviewed baseline and gear without a second equipped-stat capture. Keep mitigation AC, softcap, evasion AC, offense and accuracy separate; unavailable server formulas stay unknown.",
      "Keep written item text for correction, parse explicit Haste percentages and preserve manual edits against later OCR. Use Default Modern for calibrated screen reading.",
      "Recover transient reads without ending the Character session. A lost source offers Resume or Choose game window and returns to the same phase. Successful snapshot completion or explicit Cancel ends the flow.",
      "Use clear custom resize edges/corners on all four overlays. Dock touching windows with shared width above/below or shared height left/right; saved chains follow movement/resizing and detach when dragged away.",
      "Cycle all overlays through Unlocked → Locked → Hidden → Unlocked, retaining suspended groups while globally hidden and restoring mouse input on return.",
      "Ship one Windows/Linux version and verified wiki bootstrap. Synthetic native checks do not establish foreground game composition, all skins, production wiki writes or native Wayland."
    ],
    "steps": [
      {
        "title": "Start one guided Character capture",
        "image": "0.9.1/character-inline-source",
        "view": "character",
        "action": "Open Character",
        "copy": "Enter character name, server, class combination, level and AA count. Choose the game window inside the walkthrough and press Start reading. Use Default Modern (default_modern). Remove ANY-slot items first, then examine equipment as you unequip it. Obvious slots fill automatically; Second copy creates another physical card and the top-right X removes a mistaken one.",
        "alt": "Character walkthrough with seven progress steps, inline synthetic game-window selection and Start reading.",
        "caption": "Actual Character component at 13 px and 1024 CSS px using a disposable synthetic capture API. No game or player pixels.",
        "imageSha256": "71f751f9798c64eee059a46dcef8065ef3bac23f5b76479adb2df3383adc073a"
      },
      {
        "title": "Review one fresh No Equipment baseline",
        "image": "0.9.1/character-base-stat-review",
        "view": "character",
        "action": "Open Character",
        "copy": "Confirm every equipment slot is empty, then read Inventory/Stats. Only readings captured after that step can become the baseline. Review mitigation AC, AC softcap, evasion AC, offense and accuracy as separate values. Correct unread values in the one text block; later OCR will not overwrite your edits. Continue to re-equip ordinary items first and ANY items last.",
        "alt": "No Equipment review at 20 px with separately labeled AC and attack components and one continue action.",
        "caption": "Actual guided baseline stage at 20 px with synthetic values. Dirty edits, fresh-frame/session guards and remount persistence were checked.",
        "imageSha256": "053df95221bc6a6d4b39c9167d62f9433270455dc7feed6234a15e136f70ded1"
      },
      {
        "title": "Keep the written item block editable",
        "image": "0.9.1/character-item-stat-review",
        "view": "character",
        "action": "Open Character",
        "copy": "The item editor retains bounded pane text, including lines the parser does not understand. Correct an explicit numeric stat such as Haste: 16% and Save item to reparse it. Conflicting values stay unknown; a named effect alone cannot invent Haste. Advanced parsed values, augment inclusion, wiki match and catalog bases remain available without routine walkthrough checkboxes.",
        "alt": "Written synthetic item text with explicit Haste percentage, retained unknown inscription and one Save item action.",
        "caption": "Actual item editor with synthetic evidence. The fixture corrects Haste, saves it and confirms a subsequent read cannot overwrite the correction.",
        "imageSha256": "1669749326bd2a347d247c8c48a4fe30bb28deb02785abd2d633910f810cdea1"
      },
      {
        "title": "Confirm slots and save the snapshot",
        "image": "0.9.1/character-walkthrough-review",
        "view": "character",
        "action": "Open Character",
        "copy": "Confirm ANY and ambiguous placements together, then preview the character. Reading continues through source recovery and canceled saves. Successfully copying or saving the snapshot ends Character capture once; Cancel walkthrough is also explicit. Catalog search, offline item screenshots and manual corrections remain in Equipment and captured items.",
        "alt": "Final guided snapshot step with completed progress markers and a synthetic ANY item assigned to Charm.",
        "caption": "Actual final guided stage with synthetic equipment. Canceled Save, successful Save/Copy and repeated export completion were exercised with fake share APIs.",
        "imageSha256": "86219311c0341832b74473b8e174e8ddcc1985ead57b532e2306b0b8b2e9b46f"
      },
      {
        "title": "See equipped estimates as gear changes",
        "image": "0.9.1/character-equipped-estimates",
        "view": "character",
        "action": "Open Character",
        "copy": "No Equipment, assigned gear and equipped estimates have separate columns. Removing or moving an item recalculates additive values immediately. Partial readings carry an asterisk. AC/ATK component conversion, caps, buffs and exact Haste stacking depend on unavailable server context, so unsupported totals remain Unknown and each row explains its limits on hover. A second equipped-stat capture is unnecessary.",
        "alt": "Calculated stat table with No Equipment, Gear and Equipped estimate columns and distinct unknown AC and attack conversions.",
        "caption": "Actual calculated table with synthetic values. The fixture verifies gear removal, HP/STR updates and honest unknown formula components.",
        "imageSha256": "fe924d25ef5c5b1a1870323673666173e31452d363140d2f41caabc9113bb94b"
      },
      {
        "title": "Resize and dock every unlocked overlay",
        "image": "0.9.1/overlay-resize",
        "view": "settings",
        "action": "Open Settings",
        "copy": "Every unlocked panel has axis and diagonal resize edges, plus a visible corner grip. Move a panel to touch another: above/below share width, left/right share height. Saved follower chains move and resize together; drag away to detach. The header cycles Unlocked → Locked → Hidden → Unlocked. Global Hidden suspends the group; hiding one panel detaches affected links.",
        "alt": "Actual unlocked Parse overlay with synthetic combat totals, separate drag grip and visible bottom-right resize corner.",
        "caption": "Actual native Windows overlay with a disposable synthetic session. All 32 edge/corner inputs, client hit tests, touching docks and the corrected cycle were exercised separately.",
        "imageSha256": "48a3fc4efcb42bafc82a19b37daa89a9d163e2d7c97b1f4dfa7cf34d6cf4f678"
      }
    ]
  },
  {
    "version": "0.9.0",
    "title": "Reviewed wiki contributions and character snapshots",
    "changes": [
      "Add Contribute to Wiki and Character workspaces, sharing the existing main/overlay font settings and log session.",
      "Make local screen reading opt-in, with explicit source selection, visible capture ownership and bounded offline OCR/journal retention. Character capture pauses contribution capture; imported screenshots do not enable continuous reading.",
      "Calibrate an optional OCR area from the selected source preview. Saved areas reset safely when capture size changes; bounded item-name/stat follow-up reads preserve evidence and leave unresolved values unknown.",
      "Use the Default Modern (default_modern) game UI for screen reading. Read separate examine and Inventory panes, centered names, split stat columns and explicit upgrade progress. Other skins are not yet calibrated.",
      "Keep editable item/NPC/zone candidates and evidence locally. Review extracted fields, uncertain values and fresh potential wiki matches before preparing a page plan from the current wiki blueprints.",
      "Use the wiki's normal login in a dedicated isolated window. Require explicit review and publish acknowledgement for every planned page; retain conflict guards, per-page results and retry of unfinished changes.",
      "Include reviewed item-source changes for confirmed NPC loot with a known zone and normal/raid identity. Keep unverified zone /who names Unknown and preserve real character-capture timestamps across reloads.",
      "Build character equipment from separate physical item cards, nullable tiers and upgrade progress, augment evidence and 23 named slots with keyboard/select alternatives. Preserve observed No Equipment and equipped statistics separately from calculated gear sums.",
      "Preview, copy or save a bounded character PNG. Optional uploads target the authenticated user's own talk page after explicit review; partial upload/talk failures remain recoverable.",
      "Search the cached item catalog in Character, preview tier/progress in green and add distinct copies without fabricating examine observations.",
      "Recover reviewed base-stat proposals for tiered drops. Choose rounded ambiguities explicitly, omit unsupported values, preserve original evidence and label the wiki inference.",
      "Cycle all overlays through Locked, Unlocked and Hidden. Use visible Parse/Triggers grips and resize corners; align Triggers to the current resized Parse edges.",
      "Show the latest logged player marker in both 3D views. Auto Z follows known height; manual slicing and NPC inspection preserve their own floor/camera.",
      "Keep Intel mob order, scroll position and expanded loot stable during routine updates. A new named consider or kill still reveals its mob once.",
      "Keep game-log evidence authoritative for supported events and treat OCR output as proposals. Validation uses synthetic/offline OCR, native Windows/Linux X11 and loopback-wiki fixtures; production login/write, foreground-game composition and native-Wayland acceptance remain manual."
    ],
    "steps": [
      {
        "title": "Choose what screen reading can observe",
        "image": "0.9.0/screen-reading",
        "view": "settings",
        "action": "Open Settings",
        "copy": "Use the Default Modern (default_modern) game UI skin for screen reading; other skins are not yet calibrated. Logs supply supported events independently of the UI skin. In Settings, enable Screen reading, choose a window or display and press Start. Pause or Stop at any time. Read a screenshot imports one image without enabling continuous capture.",
        "alt": "Eye of Zomm 0.9.0 Screen reading settings with explicit source, Start, Pause, Stop and screenshot-import controls.",
        "caption": "Actual interface with synthetic folder/log labels. Opt-in controls are shown after a fixture import; continuous capture remains disabled.",
        "imageSha256": "7ab5c47da2ce5ed9b92950ed14102c00655820f4ae5c36a34f91a0a8c4c7df53"
      },
      {
        "title": "Calibrate the area OCR reads",
        "image": "0.9.0/ocr-calibration",
        "view": "settings",
        "action": "Open Settings",
        "copy": "After a capture frame arrives, choose Calibrate OCR area. Drag around the complete examine or Inventory/stat pane, including its heading, or enter percentages with the keyboard. Save area keeps that selection for the source and capture mode; Full frame clears it. A changed capture size resets the selection safely. Keep the pane visible until its editable proposal appears, then review uncertain values.",
        "alt": "OCR calibration dialog with a synthetic source preview, draggable selected area, keyboard percentage fields, Save area and Full frame controls.",
        "caption": "Actual calibration component at 13 px with a synthetic preview and capture API. This image contains no game or player screen capture.",
        "imageSha256": "ea2a6cc57354f147a52240d1720cdc32a02ebeea3cd4656648cf0ce384ea17be"
      },
      {
        "title": "Review every wiki contribution",
        "image": "0.9.0/contributions",
        "view": "contribute",
        "action": "Open Contribute to Wiki",
        "copy": "Keep proposed items, monsters and zones in a local review queue. Edit the extracted fields, verify uncertainty and potential existing pages, then preview every planned wiki change. Log in through the wiki’s normal window and explicitly approve publication. Page conflicts and unfinished related edits remain visible for review and retry.",
        "alt": "Contribute to Wiki workspace showing synthetic NPC proposals, editable fields and individual Verified controls.",
        "caption": "Actual interface using synthetic records and a loopback-only wiki account. This is not a production wiki login or edit.",
        "imageSha256": "12f8beff7fa0a0173380aa19afe46999a718536f8a213d0a1d4f5884f34e0148"
      },
      {
        "title": "Build a character from reviewed item cards",
        "image": "0.9.0/character",
        "view": "character",
        "action": "Open Character",
        "copy": "Start a named Character capture session, import an examine screenshot or add a card manually. Character capture pauses contribution capture. Review each item and place it in one of 23 named slots using drag-and-drop or the slot menus. Identical copies remain separate cards, and unknown values stay unknown.",
        "alt": "Character equipment rows with a reviewed synthetic shield assigned to Secondary and its separate captured inventory card at 10 px.",
        "caption": "Actual Character inventory and named slot menus at 10 px. The synthetic shield is assigned to Secondary; empty slots remain explicitly unknown.",
        "imageSha256": "f1d5d9294f2d6ddd3b0c11ac59ae486456b90a1564ecb32fb4387baa4baca765"
      },
      {
        "title": "Keep tiers and augment evidence separate",
        "image": "0.9.0/augments",
        "view": "character",
        "action": "Open Character",
        "copy": "Edit tier, progress, wiki match, catalog base stats, observed examine values and augment details before sharing. Leave unread progress blank instead of assuming zero. State whether the examine values already include the augments; included values are not added again. Capture No Equipment and equipped totals separately. Calculated item sums remain a separate comparison because buffs, caps and effects are not assumed.",
        "alt": "Expanded Character card editor with a synthetic augment name, separately observed augment statistics and completeness checkbox.",
        "caption": "Actual editable augment section from the isolated fixture. Synthetic values demonstrate review rather than game-derived accuracy.",
        "imageSha256": "6c2bd6862712ee4c50a267db5b72b1fe27d3087a4d30341791004342d74672b8"
      },
      {
        "title": "Preview a shareable character image",
        "image": "0.9.0/share-preview",
        "view": "character",
        "action": "Open Character",
        "copy": "Preview the complete character PNG, then copy or save it locally. The image keeps observed base/equipped stats, calculated gear sums, assigned equipment and uncertainty distinct. Optional wiki upload requires another explicit review and targets your own authenticated user talk page. Raw OCR evidence and unassigned inventory stay out of the share image.",
        "alt": "Character PNG preview with separately observed No Equipment and equipped values, calculated gear sums and named equipment slots.",
        "caption": "Actual PNG preview generated from synthetic statistics. Clipboard/save were exercised with disposable fixtures; production upload was not tested.",
        "imageSha256": "7e10e0585117048d9948c732eb7ad924bcf47d10da02d7ec6f057b5c38f3024c"
      },
      {
        "title": "Find gear in the cached item catalog",
        "image": "0.9.0/character-catalog",
        "view": "character",
        "action": "Open Character",
        "copy": "Search for item in Character, select a cached wiki match and preview its tier and fractional progress. Changed values appear green. Add to inventory creates a separate physical copy each time; catalog bases stay separate from observed examine values and unknown augment state.",
        "alt": "Character catalog search with a synthetic ring, tier three and two-eighths progress, adjusted stats in green and Add to inventory.",
        "caption": "Actual Character interface at 13 px with synthetic catalog records. Search, keyboard selection, distinct copies and persistence were exercised.",
        "imageSha256": "2af0fd5cb02883f60e50132e72186be42b5ffb3a08e65a0e9c4266201d695496"
      },
      {
        "title": "Review possible bases for tiered drops",
        "image": "0.9.0/base-recovery",
        "view": "contribute",
        "action": "Open Contribute to Wiki",
        "copy": "Recover base stats from a tiered drop preserves its original observed numbers. Verify tier/progress and that modifiers are excluded, calculate possible values and choose ambiguous bases yourself. Blank and unsupported values stay omitted. Apply the reviewed proposals, verify the stat text and inspect the full wiki preview, which labels the inference. Changed assumptions invalidate the review.",
        "alt": "Tier-four synthetic drop base recovery showing exact HP and Strength proposals, an ambiguous Armor Class range and omitted Weight and Damage Bonus.",
        "caption": "Actual review interface at 13 px. Synthetic HP 42 resolves to base 30; rounded AC needs an explicit choice. No production wiki edit is performed.",
        "imageSha256": "cb67a74250caef0577d8cb0b738be8b2986a8c5f6fed78002c75212207799d64"
      },
      {
        "title": "Arrange every overlay from one control",
        "image": "0.9.0/overlay-layout",
        "view": "settings",
        "action": "Open Settings",
        "copy": "The header Overlays button cycles all panels through Locked, Unlocked and Hidden. Unlock restores mouse input. Parse and Triggers have visible drag grips and resize corners. Move or resize Triggers near the current Parse edges to align them, even after resizing Parse. Manual Triggers height is saved; Reset positions restores automatic fitting.",
        "alt": "Unlocked native Parse overlay with Overview, Damage, Healing, Taken and Session tabs, a separate drag grip and a visible resize corner.",
        "caption": "Actual native Parse window with synthetic combat data. All-panel cycling, trusted resize input and snapping to resized Parse bounds were exercised.",
        "imageSha256": "e35ef709dce4d44462c3ebba3698ab668494ed7d1607bdf982103ee66fe26aa3"
      },
      {
        "title": "Track your logged position and elevation",
        "image": "0.9.0/map-autoz",
        "view": "map",
        "action": "Open Live Map",
        "copy": "Top 3D and First Person paint a cyan marker at the latest logged player location, even when camera Follow is off. Auto Z follows known elevation. Manual Z slicing or inspecting a mob leaves Auto Z off until you re-enable it or Reset the overlay. Missing height stays unknown; NPC camera previews never move your logged position.",
        "alt": "Native Top 3D Map overlay with Auto Z enabled, a cyan logged-player marker and separate synthetic NPC labels.",
        "caption": "Actual Electron/WebGL overlay on synthetic geometry, not a live game map. Both 3D views and the main viewer were checked for marker, camera and Auto Z behavior.",
        "imageSha256": "01648c47bbbcafa875299d0832908ffe8d854605053cb29871e31a5181a5994a"
      }
    ]
  },
  {
    "version": "0.8.9",
    "title": "Installed fonts, current Settings and clearer item stats",
    "changes": [
      "Use any installed system font through a searchable family list or manual name, shared by the main app, overlays and map controls.",
      "Clear stale interface files on upgrade so Settings reflects the installed version, and place checkbox labels beside their controls.",
      "Show item-level-modified values in green; unchanged values keep their normal color and base comparisons stay muted.",
      "Open a complete right-hand loot pane from a Live Map monster, with all drops, exact normal/raid identity, shared tier and explicit route/waypoint/wiki actions.",
      "Browse illustrated release history, including skipped versions marked New until viewed.",
      "After a newly requested Windows download is verified, restart for a silent update after a cancellable five-second countdown; Linux keeps its manual package handoff.",
      "Default the optional observed swing timer off while keeping existing saved choices."
    ],
    "steps": [
      {
        "title": "Use any installed font",
        "image": "0.8.9/system-fonts",
        "view": "settings",
        "action": "Open Settings",
        "copy": "Settings → Fonts is first on the page. Refresh installed fonts, search for a family and Apply installed font; you can enter the family manually too. The choice and text size apply to the main app, overlays and map controls and survive restart. This release also clears the stale interface cache that could hide new Settings after an upgrade.",
        "alt": "Eye of Zomm 0.8.9 Settings with the installed Calibri family and 17 px text applied.",
        "caption": "Actual 0.8.9 interface, synthetic profile and log; installed family names stay on this computer.",
        "imageSha256": "7bc54570dd07ef651650e11472cc36c35dd482901e294b143ca2c3b9d2e59cdc"
      },
      {
        "title": "Read item-level changes at a glance",
        "image": "0.8.9/green-stats",
        "view": "items",
        "action": "Open Items",
        "copy": "Move the item-level slider to see changed stats in green in item cards and main/Intel hover blocks. Unchanged values keep their normal color, with muted base comparisons in tooltips. Reduced weight and improved negative penalties count as changes too. The optional observed swing timer now starts off by default; enable it in Triggers if you want it.",
        "alt": "Synthetic item at tier 2 with green adjusted HP, Strength and Weight and unchanged Delay in normal text.",
        "caption": "Actual item browser and hover block rendered from synthetic base statistics.",
        "imageSha256": "91609b638fe69e2f94b241cdd100d28294adb81872d2fd06a1ecc269a70f30d3"
      },
      {
        "title": "Keep loot beside the Live Map",
        "image": "0.8.9/loot-pane",
        "view": "map",
        "action": "Open Live Map",
        "copy": "Click a map monster to open its loot pane on the right. Every known drop is reachable, with icons, classes, slots, item-tier stats and hover details. Same-name normal and raid sources keep separate loot. Route, Copy /waypoint and Wiki remain explicit actions; choosing a monster leaves your current route alone. Browse older illustrated updates in this release selector, including versions you skipped.",
        "alt": "Live Map loot pane for a synthetic monster with eight known drops, tier controls and explicit navigation and wiki actions.",
        "caption": "An actual capture of the Live Map loot pane using synthetic NPC and item records.",
        "imageSha256": "8499de02b999674cdaa22c1fab383f1d8a0a28ecf6273ffaa4ca4aa1c674bffc"
      }
    ]
  },
  {
    "version": "0.8.8",
    "title": "Font controls and Linux releases",
    "changes": [
      "Add saved font-family and base text-size controls in Settings, shared by the main app and native overlays while retaining per-panel text adjustments.",
      "Ship Linux x64 AppImage and deb packages alongside the Windows installer in one versioned release.",
      "Use native Linux file paths and preserve log-directory filename case, including selected Wine/Proton installations.",
      "Prefer X11/XWayland for positioned Linux overlays when available; keep explicit backend choices and document native Wayland limits.",
      "Offer verified Linux update downloads with a clear manual package handoff, while preserving the Windows silent restart/install flow.",
      "Gate publication on both platform builds and a shared verified wiki bootstrap generation."
    ],
    "sourceCommit": "1d241637acb340c490071caa52efd6ff0352dc27",
    "steps": [
      {
        "title": "A normal desktop workspace",
        "image": "0.8.8/workspace",
        "view": "settings",
        "action": "Open Settings",
        "copy": "Choose Font family and Text size in Settings; the same base applies to your overlays alongside their individual text adjustments. Window, tray and startup preferences stay saved. The green Update available action offers verified packages: Windows can restart for a silent upgrade, while Linux opens the download folder with manual installation steps. Settings also links to GitHub.",
        "alt": "Eye of Zomm main workspace showing the current desktop layout and settings.",
        "caption": "Current app capture with a disposable demonstration profile.",
        "imageSha256": "5048ed4879c5e7a0d672910c6089ff1227ea89b29ed747f76efe9c8e945332d3"
      },
      {
        "title": "Keep the map in view",
        "image": "0.8.8/map",
        "view": "map",
        "action": "Open Map",
        "copy": "Hover the zone-title row for Reset, Follow, zoom and the Map, Top and navigable First person cycle. Use the separate grip to move an unlocked window. Z and tolerance choose nearby floors; Plane of Hate starts at Z 120 and remains adjustable. Unknown-height markers stay visible.",
        "alt": "Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.",
        "caption": "The current native Map and its controls, using demonstration data.",
        "imageSha256": "72044cc953a85a2b3ee3bbedec7e638cf6d4eba7db5ccd88755eb1c461a89a70"
      },
      {
        "title": "Follow named mobs and their loot",
        "image": "0.8.8/intel",
        "view": "npcs",
        "action": "Open NPCs",
        "copy": "Item Level Slider and My Class stay above the scrolling list. Click Raid Zone to collapse it. Hover a mob name for actions in that same row, or an item name/icon for its tier-adjusted stat block. Show More expands every matching drop; Map previews the exact source in first person.",
        "alt": "Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.",
        "caption": "Synthetic NPC and loot records demonstrate the current intel view.",
        "imageSha256": "b4544e9193c0bce326c7bc74e4f33efe6e4c2ba8463e52009883f6cf9b6ae719"
      },
      {
        "title": "Bring only the overlays you need",
        "image": "0.8.8/timers",
        "view": "timers",
        "action": "Open Triggers",
        "copy": "Configure countdowns and log matches in Triggers; its compact overlay also shows swing estimates. Parse keeps Overview, Damage, Healing, Taken and Session. Healing includes labeled rune capacity. New session clears parse/loot totals while keeping your log position, map and running triggers.",
        "alt": "Eye of Zomm main Triggers page with a log-trigger editor, match preview and named captures.",
        "caption": "The current trigger editor with a synthetic log line and named-capture preview.",
        "imageSha256": "339270ee02f1214370d328c649c2c6205ef4fcf84d4c3da153d477bcd0e78c7e"
      }
    ]
  },
  {
    "version": "0.8.7",
    "title": "Triggers, session controls and complete Intel loot",
    "changes": [
      "Rename the Timers workspace and overlay to Triggers; keep existing saved definitions, countdowns and layouts.",
      "Put clearly labeled rune capacity granted under Healing, separate from measured healing and HPS.",
      "Add New session in Combat and the Parse Session tab, preserving the live log cursor, character/map context and running triggers.",
      "Reconcile NPC-page known loot with item-page drop sources, including Vicar M`Kari and the missing Lord of Loathing items; retain source-instance provenance.",
      "Overlay mob actions on the name row without shifting the list, and show tier-adjusted item stats from both item names and icons.",
      "Repair main-app item/NPC loot hover targets and preserve their tooltips through unchanged live redraws.",
      "Align host data refreshes around a 24-hour freshness guard, check the published manifest hourly while EoZ is open, coalesce overlapping checks and show distinct sync timestamps in Settings.",
      "Make Raid Zone visibly collapsible and keep its state through updates; named focus can reopen its matching section.",
      "Start Plane of Hate's native map at Z 120, retain manual slicing, and use the selected floor for unknown-height inspection cameras."
    ],
    "sourceCommit": "d174ee3319b502024edebe47490442bf6397fc22",
    "steps": [
      {
        "title": "A normal desktop workspace",
        "image": "0.8.7/workspace",
        "view": "settings",
        "action": "Open Settings",
        "copy": "The main app remembers its size, position and maximized state in a standard Windows frame. Choose Minimize to tray and Start minimized in Settings. A green Update available button appears for newer releases. Download, then choose Restart to install update for a silent upgrade and automatic relaunch. Settings also links to GitHub.",
        "alt": "Eye of Zomm main workspace showing the current desktop layout and settings.",
        "caption": "Current app capture with a disposable demonstration profile.",
        "imageSha256": "d9b8318d19a4583b669651745900aeee14db2669645f81b481f6dc7c1cab22fe"
      },
      {
        "title": "Keep the map in view",
        "image": "0.8.7/map",
        "view": "map",
        "action": "Open Map",
        "copy": "Hover the zone-title row for Reset, Follow, zoom and the Map, Top and navigable First person cycle. Use the separate grip to move an unlocked window. Z and tolerance choose nearby floors; Plane of Hate starts at Z 120 and remains adjustable. Unknown-height markers stay visible.",
        "alt": "Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.",
        "caption": "The current native Map and its controls, using demonstration data.",
        "imageSha256": "028c1006116fc1353254b745ce4381a372cfe4c5b7bc2f254bb0beb96bed8f5c"
      },
      {
        "title": "Follow named mobs and their loot",
        "image": "0.8.7/intel",
        "view": "npcs",
        "action": "Open NPCs",
        "copy": "Item Level Slider and My Class stay above the scrolling list. Click Raid Zone to collapse it. Hover a mob name for actions in that same row, or an item name/icon for its tier-adjusted stat block. Show More expands every matching drop; Map previews the exact source in first person.",
        "alt": "Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.",
        "caption": "Synthetic NPC and loot records demonstrate the current intel view.",
        "imageSha256": "c6d6e726e0236e87a27c2c098b9042bb3bd03bf9b8855b3b7da8391b19db64fd"
      },
      {
        "title": "Bring only the overlays you need",
        "image": "0.8.7/timers",
        "view": "timers",
        "action": "Open Triggers",
        "copy": "Configure countdowns and log matches in Triggers; its compact overlay also shows swing estimates. Parse keeps Overview, Damage, Healing, Taken and Session. Healing includes labeled rune capacity. New session clears parse/loot totals while keeping your log position, map and running triggers.",
        "alt": "Eye of Zomm main Triggers page with a log-trigger editor, match preview and named captures.",
        "caption": "The current trigger editor with a synthetic log line and named-capture preview.",
        "imageSha256": "da121962fe774065430706ecdd92758d9d9e3347e19a0bf4cd8a9fd5a17bcfbf"
      }
    ]
  },
  {
    "version": "0.8.6",
    "title": "Reliable maps, clean Intel names and simpler updates",
    "changes": [
      "Put the zone title and primary Map controls on one row, with a full-width hover target and a separate unlocked drag grip.",
      "Keep controls reachable while moving from the title to buttons; retain keyboard access and collapse them after leaving the header.",
      "Repair the overlay file-policy mismatch that rejected required archive support files when switching to Top or First Person.",
      "Exercise the real configured-folder and archive-file hydration path in Windows CI, alongside native pointer input over the title.",
      "Parse styled wiki drop-source links and structured item-table rows as exact source names; exclude location annotations and reward-item transclusions while preserving zone/normal/raid associations.",
      "Make **Restart to install update** silently upgrade and relaunch EoZ after verifying the staged installer, without a second app confirmation or setup wizard."
    ],
    "sourceCommit": "1790c93cdabddd5f6d20168c73cfd1cfac66e22d",
    "steps": [
      {
        "title": "A normal desktop workspace",
        "image": "0.8.6/workspace",
        "view": "settings",
        "action": "Open Settings",
        "copy": "The main app remembers its size, position and maximized state in a standard Windows frame. Choose Minimize to tray and Start minimized in Settings. A green Update available button appears for newer releases. Download, then choose Restart to install update for a silent upgrade and automatic relaunch. Settings also links to GitHub.",
        "alt": "Eye of Zomm main workspace showing the current desktop layout and settings.",
        "caption": "Current app capture with a disposable demonstration profile.",
        "imageSha256": "6db98199a377f0484934fbaca54cc0f5f59338117f26256d4a2fe149eca9a107"
      },
      {
        "title": "Keep the map in view",
        "image": "0.8.6/map",
        "view": "map",
        "action": "Open Map",
        "copy": "Hover the zone-title row to reveal Reset, Follow, zoom and the Map, Top and navigable First person cycle beside its name. Use the separate grip to move an unlocked window. Z and tolerance choose nearby floors; unknown-height markers stay visible. Monster names are interactive.",
        "alt": "Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.",
        "caption": "The current native Map and its controls, using demonstration data.",
        "imageSha256": "1df969ec93b080ad15c08ca1e2df2ddac36bae5c93822dea3bd47408ab003d6b"
      },
      {
        "title": "Follow named mobs and their loot",
        "image": "0.8.6/intel",
        "view": "npcs",
        "action": "Open NPCs",
        "copy": "Item Level Slider and My Class stay above the scrolling list. Raid Zone comes first, with separate drops. Hover or focus a mob name for actions; its Map button previews that source in first person. Show More expands every matching drop.",
        "alt": "Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.",
        "caption": "Synthetic NPC and loot records demonstrate the current intel view.",
        "imageSha256": "421cd98abb6fb9f05673345ac53d2a1b0524cfc6ade4b692a0c21099dad8c4d7"
      },
      {
        "title": "Bring only the overlays you need",
        "image": "0.8.6/timers",
        "view": "timers",
        "action": "Open Timers",
        "copy": "Parse, Map, Zone & loot and Timers are separate desktop windows. Unlock panels to move them and resize supported panels; Timers fits its rows automatically. Set countdowns and log triggers on the main Timers page; the swing bar learns your own attacks.",
        "alt": "Eye of Zomm main Timers page with a log-trigger editor, match preview and named captures.",
        "caption": "The current timer editor with a synthetic log line and named-capture preview.",
        "imageSha256": "c17698da08d8aeabc8ac3aacec13fd396ca76a1d988a0bab1ec6bf68f8262739"
      }
    ]
  },
  {
    "version": "0.8.5",
    "title": "Map modes and compact overlay controls",
    "changes": [
      "Collapse native Map controls when its header is idle; replace Fit with Reset and remove Reload.",
      "Cycle Map, top-down 3D and navigable first person inside the native Map window, loading 3D only when used.",
      "Make monster names and markers share accurate pointer/click targets and keyboard selection.",
      "Pin Item Level Slider and My Class above the scrolling Intel list, sharing the main app's saved tier.",
      "Reveal mob actions on hover or keyboard focus. Each mob's Map action opens a first-person camera preview at that source; remove the global Intel Map button."
    ],
    "sourceCommit": "47878900f7fe27470a5c762d0f55d771a2f305af",
    "steps": [
      {
        "title": "A normal desktop workspace",
        "image": "0.8.5/workspace",
        "view": "settings",
        "action": "Open Settings",
        "copy": "The main app remembers its size, position and maximized state in a standard Windows frame. Choose Minimize to tray and Start minimized in Settings. A green Update available button appears in the header when a newer release is offered; Settings also links to the project on GitHub.",
        "alt": "Eye of Zomm main workspace showing the current desktop layout and settings.",
        "caption": "Current app capture with a disposable demonstration profile.",
        "imageSha256": "95389d2563fbf9b917c6509901dcc0622b73eee5dc56229ff9879d3c0224699c"
      },
      {
        "title": "Keep the map in view",
        "image": "0.8.5/map",
        "view": "map",
        "action": "Open Map",
        "copy": "Reveal the native Map header to Reset, Follow, zoom or cycle Map, Top and navigable First person in this window. Use the Z slider and tolerance to choose nearby floors; unknown-height markers stay visible. Monster names are interactive.",
        "alt": "Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.",
        "caption": "The current native Map and its controls, using demonstration data.",
        "imageSha256": "fdb7f240f738eb00fc00509fd49445fe4f29233d937dcebbc3c43fce397296d0"
      },
      {
        "title": "Follow named mobs and their loot",
        "image": "0.8.5/intel",
        "view": "npcs",
        "action": "Open NPCs",
        "copy": "Item Level Slider and My Class stay above the scrolling list. Raid Zone comes first, with separate drops. Hover or focus a mob name for actions; its Map button previews that source in first person. Show More expands every matching drop.",
        "alt": "Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.",
        "caption": "Synthetic NPC and loot records demonstrate the current intel view.",
        "imageSha256": "421cd98abb6fb9f05673345ac53d2a1b0524cfc6ade4b692a0c21099dad8c4d7"
      },
      {
        "title": "Bring only the overlays you need",
        "image": "0.8.5/timers",
        "view": "timers",
        "action": "Open Timers",
        "copy": "Parse, Map, Zone & loot and Timers are separate desktop windows. Unlock panels to move them and resize supported panels; Timers fits its rows automatically. Set countdowns and log triggers on the main Timers page; the swing bar learns your own attacks.",
        "alt": "Eye of Zomm main Timers page with a log-trigger editor, match preview and named captures.",
        "caption": "The current timer editor with a synthetic log line and named-capture preview.",
        "imageSha256": "45ef833fb9389e30b3e29be97575cb3e879131f74f8555b4e195f81a7023c2f9"
      }
    ]
  },
  {
    "version": "0.8.4",
    "title": "Window recovery and Local Map controls",
    "changes": [
      "Remember the main window's size, monitor position and maximized state; recover saved windows when a display is removed.",
      "Add Minimize to tray and Start minimized preferences with taskbar recovery when the tray is unavailable.",
      "Remove Pin to top and restore normal Windows title-bar controls. Independent overlays keep their own lock and mouse settings.",
      "Keep the main map and its footer visible in shorter windows; add zoom controls and mouse-wheel zoom to the embedded Local Map.",
      "Replace the native Map floor selector with a Z slider and adjustable tolerance; NPCs with unknown Z remain visible on every floor.",
      "Prioritize Raid Zone above Normal Zone in the Intel list.",
      "Add the GitHub project link and a screenshot tour in Settings; refresh README screenshots from the current interface.",
      "Show a green glowing Update Available header button while an app update is available, including after choosing Later."
    ],
    "sourceCommit": "58c760f9f7c76cea8b979b91eb45660a28c35f32",
    "steps": [
      {
        "title": "A normal desktop workspace",
        "image": "0.8.4/workspace",
        "view": "settings",
        "action": "Open Settings",
        "copy": "The main app remembers its size, position and maximized state in a standard Windows frame. Choose Minimize to tray and Start minimized in Settings. A green Update available button appears in the header when a newer release is offered; Settings also links to the project on GitHub.",
        "alt": "Eye of Zomm main workspace showing the current desktop layout and settings.",
        "caption": "Current app capture with a disposable demonstration profile.",
        "imageSha256": "579169097e8b260cdd6bfd787f4f7a2f605cd7dbfa4e4b313b44437108435cbf"
      },
      {
        "title": "Keep the map in view",
        "image": "0.8.4/map",
        "view": "map",
        "action": "Open Map",
        "copy": "The separate native Map follows your logged location. Use its horizontal Z slice slider and floor tolerance to choose nearby levels; markers without a known height stay visible. The main Map Explorer has separate First, Top and Map views and local-map zoom controls.",
        "alt": "Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.",
        "caption": "The current native Map and its controls, using demonstration data.",
        "imageSha256": "e37e8cb9311fdcd4ddc592e99b24685b632101c02a7dd7bb5a22e06ce7c77f46"
      },
      {
        "title": "Follow named mobs and their loot",
        "image": "0.8.4/intel",
        "view": "npcs",
        "action": "Open NPCs",
        "copy": "Zone intel puts Raid Zone first and keeps its sources distinct from Normal Zone. Search named mobs, filter for your class and use Show More for every matching drop. Named considers and kills focus the matching row.",
        "alt": "Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.",
        "caption": "Synthetic NPC and loot records demonstrate the current intel view.",
        "imageSha256": "31357f31fc5ce75d11fcda5a061f56ca5696e49b808ab3954aa2759560c221dd"
      },
      {
        "title": "Bring only the overlays you need",
        "image": "0.8.4/timers",
        "view": "timers",
        "action": "Open Timers",
        "copy": "Parse, Map, Zone & loot and Timers are separate desktop windows. Unlock panels to move them and resize supported panels; Timers fits its rows automatically. Set countdowns and log triggers on the main Timers page; the swing bar learns your own attacks.",
        "alt": "Eye of Zomm main Timers page with a log-trigger editor, match preview and named captures.",
        "caption": "The current timer editor with a synthetic log line and named-capture preview.",
        "imageSha256": "484a9e1e0d9ee6c712f9071bb65847996918657a311702cff4ea5a760eae0356"
      }
    ]
  },
  {
    "version": "0.8.3",
    "title": "Map overlay, raid intel and PNUT triggers",
    "changes": [
      "Add an independent lightweight client-map overlay with logged position, named destinations, floor filtering and validated route guidance; remove Minimal view and the Consider window.",
      "Considering or killing a listed named NPC selects, expands and briefly highlights its intel row with a soft blip, without activating a window.",
      "Detect Raid Instance headings dynamically in wiki content, preserve normal/raid variants and provenance, and present Normal Zone/Raid Zone groups with complete expandable drops.",
      "Replace the timer editor with PNUT-style trigger lists and When/Then/Timer editing, isolated regex matching, match previews, captures, cooldowns and local sound/speech actions.",
      "Check unknown live NPC/item events against a complete bundled wiki presence index. Show Screenshot/Ignore notices inside Timers/Triggers for 15 seconds, paused on hover; explicit screenshots copy locally and never upload.",
      "Make cumulative item-era filtering explicit, offer eras present in the dataset, and keep First/Top/Map controls on the map page.",
      "Refresh the release bootstrap from the reviewed production exporter and retain existing log, folder and overlay preferences during upgrade.",
      "Accept normal Windows short-path cache aliases while retaining updater link protections; run the complete source suite on Windows before publication.",
      "Preserve normal coordinates for older clients by emitting shared raid NPC variants before their normal counterparts."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.8.2",
    "title": "Native modular overlays, timers and application updates",
    "changes": [
      "Add a separate Application updates card and header badge, with compatible beta-release discovery, verified downloads, cancellation, Later, and explicit installer approval.",
      "Keep verified downloads across relaunches, make startup downloading opt-in, and preserve the normal NSIS app identity and user-data profile.",
      "Reject mismatched installer names, sizes, hashes, redirects and downgrades; permit a replacement download when staged files change and retain the app if Windows handoff fails.",
      "Translate PNUT’s compact encounter header, exact Overview/Damage/Healing/Taken/Session tabs and flat metric tables into the EQL-themed overlays.",
      "Replace the large floating timer editor with display-only radial countdown rows and a thin swing bar; all configuration and countdown actions live on the main Timers page.",
      "Parse own incoming melee, spell, DoT and unknown-caster damage for Taken, with attacker/ability counts and rates while preserving outgoing totals.",
      "Add four actual transparent native overlay windows for Parse, Zone & loot, Consider and Timers, with saved independent positions/sizes, layout locks, background opacity, font scale and mouse passthrough.",
      "Keep one shared log/parser/timer session alive when the main window hides; retain player parse tabs, complete ability totals, encounter selection, class-aware scaled loot, waypoint/wiki actions and opt-in routes into the existing Map Explorer.",
      "Add tray/main/checked-shortcut recovery, monitor clamping, crash recovery and stale-session feedback; sandbox each lightweight renderer with restricted IPC.",
      "Implement manual/repeating countdowns, saved literal log triggers, zone-filtered kill reminders and one-time spawn reminders from a chosen duration. Persist deadlines and reject historical/stale/replayed timer starts.",
      "Add an observed melee swing bar using own hits/misses, same-second round deduplication, rolling timing changes, cast hold, optional weapon-delay seed and idle reset. EQL timestamps limit it to an estimate, without hand or weapon inference.",
      "Add synthetic regression coverage, a real Electron four-window/shared-session smoke and packaged-source parity gates for the new runtime."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.8.1",
    "title": "Wiki and map integration corrections",
    "changes": [
      "Recover complete ramp candidates with validated exact-endpoint connectors, preserve legal supported stairs, and permit one independently certified local-drop retry when ordinary routing fails. Real Mistmoore/Kurn descents recover while blocked and reverse probes remain rejected.",
      "Fix exact zone selection, queued archive loads, stale readiness and route ownership, exact logged-elevation HUD, and framing after a hidden map loads.",
      "Preserve pass-through collision faces and validate both route engines against ground support, full body clearance, legal climbs, and exposed drops before displaying a path. Match Recast agent dimensions and bound rasterization work.",
      "Permit the routing worker's WebAssembly under the desktop content policy; verify it in actual Electron CI, retain redacted rejection reasons, and check packaged runtime source parity.",
      "Record 36 rendered local-zone route probes and 27 view/scale captures, while retaining conservative destination markers and the guarded engine policy.",
      "Convert wiki NPC destinations to the client-map coordinate basis used by named routing, recompute routes after the player moves, and keep cancelled work from restarting a destination through fallback.",
      "Apply the wiki's +10 Range per tier to every item with a listed Range, including bows and throwing weapons.",
      "Honor `Class: ALL except ...` in existing packs and export the actual allowed classes in future packs, keeping unusable loot out of class-filtered recommendations.",
      "Extend the exporter's exact zone aliases so current wiki zone names retain their NPCs. Installing the reviewed server catalog and rebuilding the dataset is a separate operator step.",
      "Preserve every recognized explicit NPC template zone before category/title fallbacks, so stale categories cannot move a spawn or discard its second zone.",
      "Repair a corrupted local dataset on Sync, require SHA-256 verification, and enforce timeouts and size limits through dataset reads.",
      "Require the installer to embed the exact verified dataset fetched for its build, with bundled dataset versions and record counts in the build log.",
      "Update Electron within major version 43 and compatible transitive dependencies so the high-severity dependency audit passes.",
      "Record fresh dataset provenance, private local-archive parse observations, regressions, and outstanding real-client validation in the integration audit."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.8.0",
    "title": "Guarded real-zone spatial candidate",
    "changes": [
      "Exported the viewer's already-decoded collision meshes as finite `Float32Array`/`Uint32Array` data in its existing right-handed Y-up basis, skipping props and pass-through geometry without introducing another EQ coordinate transform.",
      "Added cooperative, cancellable zone export plus a bounded route-corridor crop so zone rendering and the established worker-first route remain available while the Recast/Detour candidate prepares.",
      "Wired the pinned Recast worker into named-mob routing. It receives transferable route-local geometry, rejects partial or unvalidated results, and atomically replaces only the rendered golden ribbon while preserving destination, view mode, camera, Z slice, cue HUD, and automatic fallback.",
      "Made zone, destination, and request changes terminate stale candidate workers. Timeouts, engine faults, missing geometry, oversized crops, and validation failures leave the existing route or destination marker intact.",
      "Matched Recast and the independent post-query guard to the shared +6 upward-climb rule, generated only downward off-mesh drop links, and indexed corridor triangles in worker-local X/Z cells so dense validation does not scan the full crop for every sample.",
      "Added diagnostics schema v2 with allow-listed collision counts, timings, engine outcome, validation count, and fallback reason; character/target identity, player and route coordinates, worker error detail, and filesystem paths are excluded while location readiness remains boolean.",
      "Added viewer-export/crop/winding/cancellation/drop tests, an export-to-Recast integration test, latest-request worker replacement tests, and Windows ASAR checks for the collision module, client, integration markers, and bundled worker.",
      "Carried forward the 0.7.9 intel-first Minimal defaults and WLD skipped-material cursor repair. EQEmu's WLD polygon/material loop independently confirms that material groups consume polygon ranges sequentially; proprietary Mistmoore/outdoor visual confirmation remains a release gate."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.9",
    "title": "Intel-first minimal view and WLD material repair",
    "changes": [
      "Made Minimal view default to the named-and-rare-mob intel panel, with the 3D map hidden unless explicitly enabled in Settings.",
      "Added independent **Show map** and **Show path controls** preferences. Waypoint copying, consider detection, and loot remain available when both are off.",
      "Removed the minimal-header destination search; routing, when enabled, starts from the mob list rather than duplicating a search surface.",
      "Changed **My Class** loot in both Minimal view and the consider tray to exclude statless and weight-only items.",
      "Replaced eager desktop archive reads with metadata indexing and current-zone hydration, and corrected the false permission status.",
      "Fixed WLD material-group cursor drift so skipped groups consume their polygon counts instead of shifting every later texture onto the wrong faces.",
      "Added release checks for lazy reads, material-group alignment, minimal defaults, and class-loot eligibility."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.8",
    "title": "Compact fly-first map controls",
    "changes": [
      "Collapsed the embedded map viewer to one control bar: zone load, Succor reset, a compact pop-out Z-depth slicer, and view controls now share the same row; the Grounded and Floors controls are no longer exposed.",
      "Made First Person initialize in Fly mode and removed the center-screen click-to-enter prompt. Clicking the map still captures mouselook without covering the scene.",
      "Changed Reset to target an explicit `Succor`/`Safe Point` map label, with the conventional zone origin as fallback, while preserving First, Top, or Map presentation.",
      "Moved route graph generation to the existing Web Worker before any collision projection. The renderer no longer performs the old 24k/50k/full collision-graph passes, while projected candidate segments still enforce the six-Z upward bound.",
      "Made Cancel Path clear the destination owner state as well as the in-flight calculation, preventing movement-driven automatic rerouting from restarting a cancelled route.",
      "Expanded S3D texture aliases, forced repeating WLD texture sampling instead of clamp-to-edge stretching, and invalidated v16 parsed-zone caches.",
      "Added a focused regression gate covering fly-only UI, one-row chrome, Succor reset, worker-first routing, persistent cancellation, and texture sampling."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.7",
    "title": "Verifiable map-coordinate release",
    "changes": [
      "Added the reported side-by-side Mistmoore capture as an exact regression: game Map `X -222.75, Y 125.50, Z -154.10`, canonical world, client `.txt` map, and viewer placement must all converge without an axis swap.",
      "Changed the viewer HUD and sync footer to use the in-game Map window's explicit `X / Y / Z` labels instead of exposing canonical world-axis names or relying on an unlabeled `/loc` tuple.",
      "Added the running app version to the always-visible desktop title bar and browser/taskbar title so a surviving or duplicate older installation is immediately identifiable.",
      "Added a post-build ASAR integrity gate to both Windows workflows. The uploaded installer must contain the current package version, title-bar version binding, coordinate formatter, viewer transform, and Map HUD before it can be published.",
      "Added Legends `/who` zone detection from the current character's row, including instance-number removal and stable short-name matching, so the map can recover without waiting for a separate zoning line.",
      "Added automatic versioned GitHub prereleases for the first verified `main` build of each `0.x` version; repeat builds preserve the existing tag, and explicit `0.x` tags are also marked prerelease."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.6",
    "title": "Player-facing coordinate clarity",
    "changes": [
      "Corrected the player anchor itself: client `.txt` maps negate canonical world X/Y but do not swap them. Restored the viewer's matching map basis so Mistmoore game `/loc -330, 120, -178.13` lands at the real local-map Succor anchor `-120, 330, -180` instead of the rotated `330, -120` point.",
      "Made every visible viewer coordinate use EverQuest's exact `/loc Y, X, Z` order; canonical world and client-map axes remain internal implementation details.",
      "Removed the Map-only reverse conversion that made the same synced position appear numerically different when changing First, Top, and Map presentations.",
      "Added real Mistmoore and Befallen Succor map anchors as end-to-end transform regressions alongside the stacked-floor fixture.",
      "Made the root `maps` family win over silently selected larger custom map packs, matching the in-game `default` dropdown unless the player deliberately chooses another set in a future preference; sync status now names the map set in use.",
      "Updated the Windows acceptance script to compare the app's displayed `/loc` directly with game chat in multiple zones."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.5",
    "title": "Coordinate truth and compact navigation",
    "changes": [
      "Separated logged/wiki, canonical world, client `.txt` map, and Three.js viewer coordinates instead of sending all four through one ambiguous transform. This release still swapped the two client-map axes; 0.7.6 corrects that remaining defect with real zone anchors.",
      "Normalized EQLWiki NPC locations into world X/Y before distance, labels, and routing, while converting back to EverQuest Y/X/Z when copying a game command.",
      "Restored paste-ready `/waypoint` copying from NPC names in the minimal rail and NPC browser, with keyboard access, non-modal confirmation, a guarded Electron clipboard bridge, and fallback behavior.",
      "Moved minimal-mode destination search, Path, and Clear into the persistent 48-pixel header and removed the redundant route band so the map receives the recovered vertical space.",
      "Kept Map Overlay intentionally readable as client `.txt` line art, while adding safe available/material/resolved texture counts to diagnostics for First/Top S3D troubleshooting.",
      "Added coordinate-boundary, waypoint-order, compact-header, clipboard-bridge, texture-instrumentation, and packaged-viewer regression gates."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.4",
    "title": "Presentation-safe route selection",
    "changes": [
      "Stopped wiki-coordinate route starts from forcing First Person or closing Map Overlay.",
      "Wrapped local map-label route starts so their legacy internal setup cannot commandeer the player's Top Down or Map Overlay choice while background routing runs.",
      "Restored the original route-progress message after presentation restoration and added a release regression that forbids the known forced-First-Person path."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.3",
    "title": "Isolated navmesh worker proof",
    "changes": [
      "Added a pinned, deterministic 747 KiB `recast-navigation` 0.43.1 module-worker bundle with transferable geometry buffers and build/package checks.",
      "Ran both the reference topology router and candidate Recast/Detour engine against the same eight redistributable fixtures; all expected path/no-path outcomes pass.",
      "Rejected Detour partial paths, projected sparse funnel results back onto collision surfaces, and added independent post-query guards for walkable support and downward-only drop links.",
      "Added a latest-request-wins worker client with calm Finding/Updating/fallback states, stale-result suppression, timeouts, worker restart, and an explicit contract that callers retain the last valid route.",
      "Retained the current viewer pathfinder as production authority; the candidate worker is bundled but dormant until real zone geometry and Windows/game-client gates pass.",
      "Added exact MIT/Zlib notices, pinned lockfile integrity, dependency-tree validation, and high-severity audit gates to CI and Windows release workflows."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.2",
    "title": "Geometry-backed spatial contract",
    "changes": [
      "Extended every asset-free route fixture into shared typed triangle geometry with one right-handed Y-up coordinate contract, upward winding, start/goal anchors, and agent constraints.",
      "Represented exposed drops as downward-only off-mesh connections, kept closed doors physically disconnected, and retained the +6 ascent contract for candidate engines.",
      "Selected pinned `recast-navigation` 0.43.1 for an isolated worker prototype after documenting licensing, package footprint, packaging, supply-chain, fallback, and API risks; the production pathfinder is unchanged.",
      "Defined calm route-engine UX states: keep the last valid path visible, never block map input or change views, swap validated routes atomically, hide implementation jargon, and preserve explicit recovery.",
      "Quantized player-facing distance labels while keeping exact internal values, reducing distracting single-unit churn during movement-bound `/loc` streams."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.1",
    "title": "Live route confidence and handoff",
    "changes": [
      "Added live remaining distance plus turn, facing, off-route, and arrival cues derived from the collision-valid golden path in First Person, Top Down, and Map Overlay.",
      "Kept the full and minimal route status synchronized with new `/loc` samples so a moving player sees the next action without reopening route controls.",
      "Added a Settings export for redacted support diagnostics using an explicit allow-list that excludes character names, log contents, log filenames, and filesystem paths.",
      "Added a deterministic, asset-free route corpus with eight outdoor, indoor, stacked-floor, ramp, closed-door, exposed-drop, and illegal-ascent expectations plus pass-rate and segment-policy reporting.",
      "Added a repository-native contributor handoff and implementation-status index, cross-linked from the README and vision with the exact next road-to-v1 task.",
      "Marked shared geometry-backed corpus adapters as the next 0.8 evidence gate before adopting a reviewed worker-based Recast/Detour pathfinder."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.7.0",
    "title": "Replacement-map navigation loop",
    "changes": [
      "Added dataset-backed named and rare-mob labels directly to First Person, Top Down, and Map Overlay views, prioritized by known current-class loot and routable with one click.",
      "Rebuilt the minimal-mode mob rail around useful current-zone targets, relevant-first ordering, mob/loot search, route state, distance, and expandable Itembox-enabled loot instead of a long undifferentiated list.",
      "Added stable heading interpolation across recent `/loc` samples, retaining facing through duplicate/jitter lines and refusing to invent a heading after a zone-scale position jump.",
      "Made location sync preserve the selected map presentation internally instead of switching through First Person on every update.",
      "Increased live log responsiveness while a map or route is active and coalesced bursts to the newest `/loc`, preventing movement-key bindings from creating a renderer backlog.",
      "Kept persistent routes updating during continuous movement without an endlessly-reset debounce, while retaining collision validation and the eight-unit re-route threshold.",
      "Documented `/loc` movement-key setup in the compact navigation surface and expanded the v1 roadmap around a replacement-map product contract."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.6.0",
    "title": "Usable exploration loop",
    "changes": [
      "Replaced ambiguous map Sync failures with a visible Folder → Log → Zone → `/loc` readiness sequence and state-specific recovery actions.",
      "Added one persistent current-zone destination field with named suggestions, explicit route/marker/error status, shortest routed distance, Clear, and automatic re-routing after meaningful `/loc` movement.",
      "Kept First Person, Top Down, and Map Overlay controls available across full/minimal transitions, remembered the last full view, and preserved explicit same-zone floor filters during re-centering and route updates.",
      "Added a remembered minimal-mode intel collapse control while retaining current-fight DPS, named mobs, class drops, route controls, pinning, and Full view.",
      "Expanded current-zone/class item discovery with embedded icons, slot and sort overrides, one-click Reset, useful-gear-first ranking, and honest scope/empty states.",
      "Made Itembox details keyboard reachable and made tier-adjusted values update immediately, visibly highlight changes, and retain base values for comparison.",
      "Repaired S3D WLD material resolution by using bitmap fragments' actual `fileName`, normalizing BMP/DDS names, supporting animated frame filenames, and invalidating stale v15 parsed-zone caches.",
      "Replaced routine focus-stealing browser alerts with dismissible in-app notices, and added Ctrl/Cmd+K plus `/` shortcuts for the reliable wiki-only Search EQLWiki field.",
      "Improved NPC relevance ordering while retaining modern con text and tile tinting, and kept all existing consider tray, encounter, loot evidence, pin/taskbar, coordinate, and directed movement contracts.",
      "Expanded the product vision into a release-gated road to v1 with journey contracts, user stories, click budgets, risk ownership, uncoached usability tasks, and a Windows/game-client acceptance script."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.5.4",
    "title": "Release pipeline reliability",
    "changes": [
      "Separated clean-checkout tests from the production catalog relevance gate so CI no longer expects the intentionally git-ignored bootstrap pack before it has been downloaded.",
      "Added a verified production-data fetch followed by the relevance gate to CI, Windows installer, and tagged-release workflows."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.5.3",
    "title": "Live map and movement routing",
    "changes": [
      "Removed the erroneous planar sign inversion from logged `/loc` coordinates while retaining EverQuest's Y/X-to-X/Y ordering, so negative in-game map positions remain negative in the viewer.",
      "Stopped trusted `/loc` and NPC-label elevations from snapping to an upper floor in stacked dungeons; grounding now honors the reported Z with only the six-unit movement tolerance.",
      "Added the Legends rare-creature consider wording (`- a rare creature - scowls at you`) to the parser so a fresh consider opens the bottom-docked loot tray with the clean NPC name.",
      "Reworked geometry-derived routing as a directed movement graph: upward travel is capped at exactly 6 Z, downward travel is unlimited, and a drop cannot be reversed as an invalid climb.",
      "Prevented routes from falling through overlapping floors, tightened indoor-zone sampling for narrow corridors and stairs, and retained wall/collision validation for every route edge.",
      "Matched first-person step and jump configuration to the same six-unit routing constraint and invalidated old parsed-zone cache data.",
      "Kept First Person, Top Down, and Map Overlay controls available in minimal mode, persisted the chosen mode, and recentered that mode instead of forcing First Person after every `/loc` update.",
      "Added explicit game-folder/map-file readiness states and automatic viewer reconnection so Sync distinguishes a missing folder from a configured folder that is only waiting for `/loc`.",
      "Changed the Items default from an alphabetical global catalog to current-zone, current-class results ranked toward equipment and meaningful stats; deliberate search broadens the scope.",
      "Made detected classes visible through an Auto filter state and added a clear Current zone scope control.",
      "Made the Item Level Slider update already-open Itembox tooltips and display a clearly labeled tier-adjusted stat block alongside wiki base lines.",
      "Kept repeated `/loc` events out of Overview activity and renamed manual map recovery actions around their actual result: reload the zone or center on the last `/loc`.",
      "Added a comprehensive product and UX vision with click budgets, end-to-end flows, user stories, recovery language, acceptance scenarios, and a phased roadmap."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.5.2",
    "title": "Consider loot tray",
    "changes": [
      "Restored consider-driven loot intelligence as a temporary bottom-docked tray without bringing back the unreliable permanent Current Target card.",
      "Added class filtering, item icons and Itembox hovers, wiki links, and direct pathing for the considered NPC.",
      "Kept the tray open while hovered or keyboard-focused, then resumed its dismissal timer after inspection.",
      "Normalized apostrophe and backtick variants when matching considered NPC names to EQLWiki drop sources."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.5.1",
    "title": "Map alignment and navigation",
    "changes": [
      "Normalized logged `/loc` output into the coordinate basis used by EverQuest map files and EQLWiki locations, fixing the swapped and inverted player marker in Befallen and other zones.",
      "Made the first-person minimap player-centered and heading-up from consecutive `/loc` samples, with nearby named mobs and the active route labeled directly on the map.",
      "Switched route calculation to a height-aware walkable-surface graph derived from the rendered zone collision mesh, preserving floors, ramps, walls, jump limits, and drops while reporting shortest-route distance.",
      "Repaired S3D material-to-bitmap resolution so original zone textures load instead of placeholder gray/white materials.",
      "Bumped the parsed-zone cache version so existing installations rebuild previously cached zones with corrected texture data."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.5.0",
    "title": "Release UX and map overhaul",
    "changes": [
      "Added first-run EverQuest folder setup and automatic selection of the most recently modified `eqlog_*.txt` under `Logs`, with folder and log overrides in Settings.",
      "Removed the unreliable current-target surface, last-location metric, and remaining player-card redundancy; the header now shows character, classes, level, and zone.",
      "Added explicit First Person 3D, Top Down 3D, and Map Overlay modes, with all floors shown by default.",
      "Corrected the EQ-to-viewer coordinate flow and made consecutive `/location` updates face the player's movement trajectory.",
      "Kept route-to-NPC support map-label-first with schema-v3 EQLWiki coordinates as the fallback.",
      "Changed pinned mode to hide the draggable title bar while keeping Eye of Zomm visible in the Windows taskbar.",
      "Added the modern light-blue consider band and verified yellow at +1 through +3 and red at +4 or higher.",
      "Reduced helper copy and removed every retired product-name reference from the app and repository.",
      "Upgraded the exported dataset to schema v3 so two-coordinate locations and pages with multiple location tuples are handled safely.",
      "Added loopback request/file bounds, state-changing POST guards, first-run/log-selection tests, exporter fixtures, UI checks, and release checks.",
      "Added optional trusted Authenticode signing and verification while allowing clearly identified unsigned builds until a certificate is configured."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.4.0",
    "title": "Map and target focus",
    "changes": [
      "Corrected consider colors so +1 through +3 are yellow and +4 or higher is red.",
      "Made Current Target a permanent, prominent Overview panel with class-filtered loot.",
      "Expanded minimal mode with current-fight DPS, a pathable mob list, and a temporary hoverable target-loot panel.",
      "Persisted the user-approved EverQuest folder handle and inferred the installation root from the selected log path.",
      "Added automatic first-person location focus and NPC route fallback to exported EQLWiki coordinates.",
      "Changed pinned mode to hide the application from the Windows taskbar.",
      "Restyled item hovers after EQLWiki's Itembox and extended the cPanel exporter with Itembox lines and embedded icons.",
      "Removed redundant helper copy and the duplicate Player card.",
      "Added optional Authenticode signing and signature verification to Windows build/release workflows."
    ],
    "sourceCommit": null,
    "steps": []
  },
  {
    "version": "0.3.0",
    "title": "EQLWiki - Eye of Zomm",
    "changes": [
      "Rebranded the project as **EQLWiki - Eye of Zomm**.",
      "Changed the Windows application identity, installer name, shortcuts, and custom protocol to `eqleoz://`.",
      "Moved player-facing dataset checks away from EQLWiki and onto the GitHub `dataset` branch.",
      "Dataset synchronization now checks GitHub on every application startup and on **Sync with Wiki** button press.",
      "Added low-priority MediaWiki server exporter + one-commit GitHub dataset branch publishing workflow.",
      "Added repository-scoped deploy-key support for weekly/manual cPanel synchronization without a personal token.",
      "Kept the embedded Zone Viewer navigation-focused and removed additional nonessential viewer controls from the app UI.",
      "Expanded exported NPC metadata with race, class, and description where present.",
      "Retained local wiki search and explicit Open on Wiki behavior.",
      "Added persistent **Pin to top** and a compact map + named-drop minimal view.",
      "Added local item hover tooltips, observed loot history, and logged drop-rate estimates.",
      "Added configurable combat encounters named for the first attacked NPC and their start time.",
      "Repaired embedded Zone Viewer startup and current-zone/location synchronization.",
      "Simplified the header search to a reliable, wiki-only **Search EQLWiki** field.",
      "Added con-color tinting to NPC cards and current-zone NPC rows.",
      "Screen reading remains intentionally unimplemented."
    ],
    "sourceCommit": null,
    "steps": []
  }
]);
