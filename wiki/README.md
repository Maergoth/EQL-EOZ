# Optional wiki pop-out launcher

`CommonJS_companion_launcher.txt` is an optional block for `MediaWiki:Common.js`.

It adds a **Companion** link to the wiki's personal/actions portlet and opens:

```text
eqleoz://open
```

The Windows installer registers this protocol with the operating system, so the link can launch/focus the installed desktop application without the wiki needing to know which localhost port the app uses.

The link is only a launcher. No log/game information is sent to EQL Wiki, and it causes no MediaWiki API work.
