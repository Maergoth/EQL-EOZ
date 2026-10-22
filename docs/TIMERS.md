# Local triggers, countdowns and observed swing estimates

Eye of Zomm's timers use one session in the main renderer. Native overlay
windows receive snapshots and send commands to that session; opening another
panel must never create another parser or timer engine. Definitions, active
absolute deadlines, paused remaining durations, zone filters, swing settings
and replay guards are saved locally. Nothing is sent to game chat or shared.
All creation, editing and countdown controls live in the main app's **Triggers** page. The floating Triggers window is a compact display of
countdowns and the swing bar; it contains no timer editor or management forms.
The rename retains the existing persisted definitions, deadlines and panel IDs.
**New session** resets combat/loot parsing without resetting trigger state,
running countdowns, swing settings or freshness/replay protection.

The interaction reference is PNUT M&M at commit
[`28bbf8d39fdd52074c39cf2542ec65f7ccf104f0`](https://github.com/Maergoth/pnut-mnm/tree/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0):

- [README, auto-attack bar and triggers](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/README.md#L440):
  a bar that waits for an observed swing, optional weapon-delay seed, rolling
  estimates and replace/retain/add overlap behavior.
- [`mnmparse/swing.py`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/swing.py#L35)
  and [swing tests](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/tests/test_swing_timing.py#L15):
  exclude activated melee abilities, include misses, deduplicate a round, learn
  only from observations and keep seed changes from moving an existing bar.
- [`mnmparse/app/timer_panel.py`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/timer_panel.py#L66):
  countdown rows, remaining-time presentation and restart/dismiss controls.
- [One-time timer tests](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/tests/test_one_time_timers.py#L24)
  and [`start_one_time_timer`](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/triggers_runtime.py#L504):
  independent spawn reminders do not become persistent chat triggers.
- [Main-app trigger editor](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/app/triggers_page.py#L66):
  saved definitions, an editing surface and explicit overlap choices stay in
  the complete app while the floating timer panel presents active countdowns.

The JavaScript implementation follows those interaction rules with EQL's log
timestamps. It does not use PNUT's OCR timing, hand inference or Python runtime.

## Countdown behavior

Manual timers accept a name and duration from one second through seven days.
They can repeat, pause, resume, reset or be dismissed. Repeating timers preserve
their original phase after sleep/restart; the engine computes elapsed cycles
directly instead of running missed callbacks. Ended one-time timers stay at zero
until reset or dismissed. Definitions and timer rows are separate: resetting or
closing a row does not create or edit a reusable definition.
The main page follows PNUT's list/editor layout: search and enable checkboxes
on the left; New, Duplicate and Delete below the list; one selected editor on
the right with Save and Fire now. The editor groups **When the chat says**,
**Then**, and **Start a timer**. Running timers and Swing have their own tabs,
with one-time countdown and last-kill reminders under Running timers.
Editing a saved definition preserves its ID and does not
overwrite an already running countdown. New live snapshots leave unsaved
editor fields intact. Definitions can be disabled without deleting them;
Fire now remains available for manual testing. Unsaved changes must be saved
before firing. Errors and worker timeouts appear in the editor.

Text-trigger definitions support Contains, Starts with, Whole line and Regular
expression. Literal matching ignores case and repeated whitespace and strips
the log timestamp. Punctuation is significant unless **Ignore punctuation** is
enabled. Existing literal definitions keep their original behavior. A text
trigger can replace its prior timer, retain the existing one or add another.
All three choices are available under **If already running** in the main
editor. Its optional zone filter controls where new triggers may start. Existing
zone-bound timers keep counting while another zone is active and expose
`visible:false` to the panel; zoning never pauses their deadlines.

**Test match** previews a pasted line, matched text, captures and the expanded
display label without starting a countdown, showing a notification or playing
audio. Labels and speech can use `{name}`, `{line}`, `{match}`, numeric captures
such as `{1}`, and named captures such as `{damage}`. JavaScript `(?<damage>\d+)`
and PNUT's common Python spelling `(?P<damage>\d+)` are both supported. Other
expression syntax follows JavaScript; this is not a complete Python-regex
compatibility layer. Unknown placeholders remain visible rather than disappearing.

**Then** can show a label, play a built-in sound or speak local text. Turning
off **Start a timer** produces a brief notification instead of a countdown.
Quiet for suppresses repeated matches using event time. Countdown options
include warning/low thresholds, normal/warning/low colors, and separate warning
and end cues. Warnings and end cues fire once per observed timer cycle, and
missed cycles during sleep do not produce an audio backlog. Speech and sound
playback belong to the sole renderer session; the engine emits bounded cue
records and never invokes an executable, opens arbitrary sound files, sends
game input or performs network actions. PNUT's custom audio files, OCR typo
matching, and timer sharing/import/export are outside this implementation.

## Isolated expression matching

User expressions compile and execute only in `app/workers/trigger-match.worker.js`.
`TriggerMatcher` applies a 150 ms wall-clock deadline, terminates a stuck worker
and starts a clean worker for subsequent work. Live definitions that exceed the
deadline are disabled with a saved review message. The editor's test preview
reports invalid syntax or a timeout without freezing the main app or overlays.
Patterns are limited to 2,048 characters and lines to 8,192 characters.

Literal, kill and swing processing stays synchronous. Regex lines are batched
in event order (128 lines per batch, at most 256 queued), with their event-time
zone retained. One bounded retry after quarantining an offending expression
lets healthy definitions see that batch. Backpressure skips excess work with
a visible matching-status message. Editing/deleting a definition while work is
pending prevents an obsolete pattern from firing; closing the session resolves
pending work and terminates its worker. Saved manual/literal definitions and
absolute countdown deadlines migrate without restarting.

One-time spawn reminders use a logged kill's target and zone plus the duration
the user supplies. The deadline is **kill timestamp + chosen duration**, even if
the menu opens later. A duration is a personal reminder, not an assertion of the
NPC's actual respawn period. The engine has no respawn-period database or
automatic default-period inference. A saved spawn definition may instead match
future logged kills of one exact target name, optionally in one zone. It still
uses the user's chosen period. Kill text alone cannot prove a target is an NPC;
the user chooses whether the reminder is appropriate.

At most 64 definitions and 100 timer rows are retained. A new row first removes
an ended row at capacity; it never silently drops a running timer. Invalid saved
rows are skipped individually without breaking startup.

## Swing behavior and its limits

The single **Observed melee** bar estimates the player's attack round. Eligible
own hit/miss verbs are `hit`, `slash`, `crush`, `pierce`, `punch`, `claw`, `bite`
and `maul`. Specials such as kick, bash, backstab, strike and taunt keep their
existing damage behavior but cannot reset this bar. Incoming attacks, another
player's attacks, DoTs, heals and spell damage cannot count as a melee swing.

Without a seed, three accepted rounds provide the first estimate. All eligible
lines in one logged second count as one round, including double attacks and
different weapon verbs. The bar uses the actual event timestamp, so delayed
delivery shows elapsed progress immediately. It fills once, waits at full for
the next observed round and becomes idle after a quiet interval (2.5 estimated
periods plus one second, or ten seconds while learning). A new round after that
quiet interval starts a new learning sequence. Restarting the app never restores
an old swing phase. Changing the selected log or character clears the previous
swing phase even when both characters are in the same zone; saved definitions
and countdowns remain app-scoped.

A robust rolling estimate uses up to 24 rounds/90 seconds and valid gaps of
one through eight seconds, allowing a missed line to represent multiple rounds.
Two agreeing gaps that differ from the current estimate by over 10% and at least
0.4 seconds switch the estimate promptly when the new mean is less than 1.6
times the current interval, following PNUT's regime guard. Larger slowdowns and
integer-multiple gaps can remain ambiguous with missing rounds: a change from
two to four seconds looks like every other log line being lost. **Relearn swing**
clears the existing estimate so new observed rounds can establish the slower
interval. These are heuristics, not a weapon speed or haste measurement. The
optional **Delay** (weapon delay) setting is in tenths
of a second: `36` seeds 3.6 seconds; `0` selects automatic learning. A seed is one
initial timing sample after a real swing. It neither invents an initial swing nor
overwrites an existing seed or learned reference when edited. New real rounds
replace its influence. Valid setting range is 0–200 tenths; automatic learning
is limited to the observed-gap range above.

An own `You begin casting …` line holds an active estimate at full. Own spell
damage/healing, an explicit own spell/casting interruption, or a new eligible
melee line releases that hold without fabricating a melee reset. The log parser
does not infer a cast duration or successful cast end from a spell database.
Unrecognized cast completions remain uncertain and the bar eventually idles.

EQL timestamps have one-second precision. The bar exposes that limitation and
does not claim PNUT's OCR-frame precision, exact main/off-hand separation, weapon
identity, a guaranteed next swing, or same-second swing ordering. Short/ambiguous
rounds and unrecognized wording may be missed. No input is sent to EverQuest.

## Integration contract

`TimerEngine({now, definitions, state, matcher})` accepts an injectable millisecond clock
and validated local state. `consume(event, context)` accepts parsed events and
raw log text. Use `context.at` for an unparsed line, `context.text` for literal
triggers, a stable `context.logId`, and `context.zone`/`character` for session
context. Initial tails, imports and history/backfill must use `live:false`.
Historical context still establishes the active zone for timer visibility,
without creating a kill reminder, trigger or swing. The application also gates
live input by event freshness and requires a valid original log timestamp.
Trigger deadlines are
based on log time; already elapsed trigger events do not start fresh repeaters.

Persisted per-log high-water timestamps and recent line hashes reject replayed
lines, including the final same-second line after restart. If the caller supplies
`lineId`, it must identify the same file line consistently across rereads.
The engine keeps at most eight log watermarks and 512 recent hashes. Switching
to a different log uses that log's separate watermark. Initial/backfill gating
remains required; these bounded replay guards are additional protection.

`command(action, args)` accepts `save-definition`, `remove-definition`, `start`,
`fire-definition`,
`pause`, `resume`, `reset`, `cancel`/`delete`, `cancel-all`, `create-spawn`,
`reset-swing`, `set-swing-enabled`, `set-swing-delay` and `set-zone`.
`snapshot(now)` advances absolute deadlines and returns cloned definitions,
timer rows, last logged kill and the observed swing estimate. Countdown progress
is 1→0; swing progress is 0→1. `exportState()` is JSON-serializable. Persist it
after every live batch and command, including watermark/kill-only changes.
`consume` returns a boolean for synchronous work or a Promise when regex work
is queued; completion reports whether a countdown/notification fired. The
session coalesces asynchronous completion publication without blocking parsing.
`preview(definition, line)` is asynchronous and side-effect free.
`drainCues()` returns and clears bounded sound/speech records. `close()` stops
the matcher. Snapshots include transient notifications and matching status.

`app/parser.js` retains outgoing damage totals and encounter construction.
Melee events gain `skill`/`swingEligible`. `melee-miss`, `cast-begin` and
`cast-interrupt` are recent activity events, not fabricated damage or historical
encounter events. The supported miss/cast wording is evidenced in PNUT's
[grammar](https://github.com/Maergoth/pnut-mnm/blob/28bbf8d39fdd52074c39cf2542ec65f7ccf104f0/mnmparse/grammar.py#L368)
and parser fixtures; other wording remains unsupported until independently
observed.

## Verification

`node tests/timer-engine.mjs` uses synthetic redistributable events and log
lines. It covers pause/resume/reset/dismiss, repeat phase across sleep/restart,
literal text matching, zone filters, overlap retention, history and persisted
replay guards, kill-time spawn deadlines, corrupt local state, existing parser
damage/encounter behavior, hit/miss learning, same-second clusters, waiting and
idle states, observed haste changes, cast hold/interruption, seed replacement
and settings persistence. Real worker tests additionally cover named/numeric
capture handling, invalid syntax, a pathological expression that is terminated
while the owner event loop stays responsive, clean-worker recovery, live
quarantine with healthy-rule retry, event order/zone retention, label and speech
substitution, side-effect-free preview, notification expiry and once-only cues.
Existing `node tests/test.mjs` also passes after
parser enrichment. `node tests/overlay-session.mjs` verifies retained parse
aggregates before feed limits, batch persistence, action dispatch, restart and
replay handling, periodic expiry, storage/transport recovery and disposal.
UTF-8 stress cases also verify that oversized native snapshots shrink feeds
and details below the broker limit while preserving damage/healing/rune totals,
action counts, timer deadlines and panel-targeted error notices.
`node tests/timer-settings.mjs` exercises the main editor against the real timer
engine, including editing without duplicate definitions, draft retention during
live updates, all countdown controls, literal/zone/overlap choices, kill-time
reminders, swing controls, unavailable-session handling and visible errors.
It also covers the selected-trigger list/editor, duplicate/enable controls,
regex preview and saving, captured labels, notification-only actions and
explicit Fire now behavior.
These tests do not establish live-game attack precision or
an NPC's actual respawn time.
