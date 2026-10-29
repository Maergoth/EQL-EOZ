# Feature controls and Settings

Open **Settings → Features** to choose which parts of Eye of Zomm are available.
Switching a feature off hides its tools and stops its owned work. Your saved
characters, contribution drafts, trigger definitions and preferences are kept.
Switch it on again to use them.
Disabled features disappear from navigation, Settings cards, overlay menus,
Overview cards and related shortcuts or prompts. Empty Settings topics disappear
too. Only their switches in **Settings → Features** remain, so you can enable
them again. Search shows settings for the tools that are currently available.
Changes wait for local data that must be saved before stopping. If that save
fails, the setting stays on and reports the error.

Settings has topic links for Features, Game setup, Appearance and windows, Maps
and combat, Screen reading, Updates and wiki, and Help and support. **Find a
setting** searches the section names, labels and descriptions. Choosing a topic
clears the search and moves keyboard focus to that section.

| Feature | What the switch controls |
| --- | --- |
| Live Map | Map views, map-file reading, location display and routes. |
| NPC intelligence | NPC browsing, target intelligence and the Intel overlay. |
| Item browser | The Items view and its cached item comparisons. |
| Drop history | Recording and displaying personal loot in the Drops view. |
| Combat parsing | Damage, healing, encounters and the Parse overlay. |
| Triggers and timers | Trigger matching, countdowns, alerts and the Timers overlay. |
| Wiki contributions | Discovery suggestions, contribution review and publishing. |
| Character | Inventory imports, private character sheets, statistics and sharing. |
| Overlay windows | All independent desktop overlay windows. Individual panels also require their own feature. |
| Screen reading | Availability of local OCR and image reading. The separate consent control must also be enabled. |
| Drop observations | Availability of optional observation collection and sync. The separate collection preference must also be enabled. |

All availability switches initially preserve the app's existing behavior.
Screen reading still starts **off** on a new installation. Turning its feature
back on does not grant consent or resume a reader; start reading deliberately.
Drop history and drop observations are independent: one is your local session
list, the other collects minimal observations for optional wiki sync.
Disabling Triggers pauses running countdowns. Re-enabling it keeps them paused
until you resume them; missed log matches and automatic actions are not replayed.

**Overview** and **Settings** remain available. The common log connection keeps
character, zone and location context available for the tools you leave enabled.
App updates and cached wiki-data updates remain separate from feature choices.
Turning off contributions does not prevent an enabled Character tool from
sharing its sheet.

For fonts and overlay layout, use **Appearance and windows**. For the game folder
or log file, use **Game setup**. **Updates and wiki** contains both application
updates and cached dataset status, plus the drop-observation preference.

The [developer guide](../DEVELOPMENT.md) describes the central registry,
persistence, runtime enforcement and how to register future features. User
instructions for each tool are in the [README](../README.md); release changes
belong in the [changelog](../CHANGELOG.md).
