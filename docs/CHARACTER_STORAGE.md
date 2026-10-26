# Character storage capacity

Eye of Zomm 1.0.6 increases the saved Character model limit from 1,500,000
bytes to **8 MiB (8,388,608 bytes)**. The saved profile roster increases from
8,000,000 bytes to **32 MiB (33,554,432 bytes)**. These are application limits,
not game limits. Ordinary inventory exports can expand substantially when
resolved item stats, effects, icons and provenance are included.

The model, per-profile validator, renderer storage bridge and native persistence
host must agree on these capacities. The native host derives a larger bounded
outer-file allowance for escaped JSON strings. Its fixed keys, private filename,
renderer/origin restrictions and atomic file replacement remain unchanged.

The schema-1 JSON format and inventory import flow are unchanged. There is no
compression, icon interning, data migration or field omission. Existing saved
characters and exports remain readable. Item counts, tiers, socket positions,
physical bindings, observed stats, manual changes and achievements retain their
existing meaning. The existing 1,000-card, eight-socket, 32-profile and raw export
file/parser bounds remain separate constraints.

Desktop Character storage is a private file independent of the browser origin.
When the native host is ready, browser localStorage is only a best-effort mirror;
its quota must not reject a native-backed save. When native storage is unavailable,
a browser-only save must succeed before replacing the bridge's previous in-memory
value. Browser quotas are controlled by the browser and cannot be enlarged by
changing these application limits. A rejected import or roster save preserves
the previously committed data.

Use synthetic fixtures to verify a resolved import above the former 1.5 MB limit,
paired achievements, repeat imports, profile switching/restart, native file
round-trips, multibyte limits and quota failures. Keep player exports, native
storage files and diagnostic payloads private. Actual packaged execution and
exact-head release CI remain separate evidence from source-only fixtures.
