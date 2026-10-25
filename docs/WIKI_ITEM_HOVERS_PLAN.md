# Shared wiki item mouseovers

The main NPC/item/loot/Live Map mouseovers, native Intel item mouseovers, and
Character inventory/equipment/editor/share-preview cards use the same local
wiki Itembox presentation. This extends the reviewed Character renderer from
PR24; it does not merge unrelated pending contribution changes.

- `app/character-itembox.js` renders escaped inline wiki stat groups, the
  centered title, right-side icon, linked effects, and compact Exaltation
  name/effect entries. Display-only weapon defaults respect explicit overrides.
- `app/catalog-itembox.js` adapts cached base/adjusted catalog values for main
  and native Intel hovers. Rendering does not modify cached records or add
  item statistics to recorded Character totals. Main drop-source context stays
  below the item details.
- `app/wiki-itembox.css` is loaded after existing main/Character/native styles.
  Original unmodified wiki frame GIFs and their provenance are in
  `app/assets/wiki-item-card/`. Native Intel permits same-origin packaged
  images; arbitrary item image URLs remain rejected.
- Character's tier slider remains directly under the title. Existing socket
  controls, tier badges, 350ms pointer-hover delay and immediate keyboard focus
  behavior remain. Explicit installed-font preferences override default Arial.
- Character sharing authorization is separate from this presentation change;
  no sharing confirmation or publication behavior is changed here.

Focused renderer/catalog/Character/overlay checks pass. The real Electron
installed-font fixture passes with synthetic data and an isolated profile,
including main/native green adjusted values, persisted font choice, and reload.
Private screenshots were inspected at
`.local/validation/overlay-item-followups/wiki-itembox-main.png` and
`wiki-itembox-intel.png`. No player data, game capture, dataset refresh or live
wiki edit was used. Linux compositor acceptance and release publication are
separate checks owned by the release workflow.
