# Windows configuration replacement

The main process keeps configuration updates serialized. Each atomic JSON write
uses a unique exclusive temporary file beside its destination. A transient
Windows rename failure (`EPERM`, `EACCES` or `EBUSY`) retries the same replacement
after 25, 50, 100, 200 and 400 ms: at most six attempts and 775 ms of waiting.

The existing destination is never deleted or truncated to force replacement.
Other rename failures, write failures and non-Windows platforms do not retry.
Terminal failure preserves the original error and attempts to remove only the
temporary file; a cleanup error cannot hide the failed save. A later queued
configuration update reads the last successfully saved settings.

`desktop/atomic-write-json.cjs` supplies this policy to the existing main-process
writer for configuration, window placement and overlay preferences. Other stores
and their write queues are unchanged. The helper is included in the exact ASAR
source-byte gate.

`tests/atomic-write-json.mjs` injects faults into real temporary files and runs
the actual main-process configuration merge queue. It covers transient recovery,
bounded exhaustion, unrelated errors, destination preservation, temp cleanup,
same-millisecond writers and serialized recovery. The native window-lifecycle
fixture separately exercises the real main/preload Settings IPC with a disposable
synthetic profile. Neither test changes an installed profile.
