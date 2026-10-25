# Automatic destination matching

Opening a discovery checks its destination page automatically while Contribute
is visible. Editing the destination waits 350 ms after typing before checking.
The former **Check live wiki** button is removed. Results update only the
matching suggestions, preserving the form, focus and unsaved stat edits.

Matching requests for the same kind/title coalesce. This editor retains up to
200 recent suggestion results for five minutes and backs off failures for 15
seconds. Repeated app refreshes do not poll a selected title. Leaving the view,
editing a title or replacing its form rejects late result updates. A failed
lookup never claims a page is missing.

Matching suggestions do not authorize a contribution. Automatic discovery
admission still requires the shared native live-wiki proof, and the reviewed
preview/publication paths recheck their destination and current content.

Discovery controls follow visual and keyboard order **×**, then **∞×**. The
ordinary dismiss and durable entity-ignore behavior remain unchanged; restores
are available in Contribution History.
