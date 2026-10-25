// Compatibility entry point for the supported test:workspace-098 command.
// The current workspace fixture covers the original contribution, screenshot,
// item-hover tier/focus and recorded-total checks, plus the newer Preview /
// Publish flow and inline icon paste. Keeping one implementation prevents this
// command from depending on controls removed from the current app.
// process.argv is unchanged, including --screenshots <directory>.
await import('./test-099-workspace.mjs');
