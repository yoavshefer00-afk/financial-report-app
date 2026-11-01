# Financial report app

Desktop app (Windows) of the financial report generator: a window with the tool's page. Files are read and the
report is made on the computer; the page can't reach the network. On each start the app fetches the newest
`index.html` of this repository (a few seconds at most) and uses it, so changes to the tool arrive without
reinstalling. Without a connection it uses the last page it had.

- `index.html`: the tool's page, built from the source repository (a single file with everything in it).
- `main.js`, `update.js`: the app's shell. A new installer is needed only when these change.
- Install: download `FinancialReport-Setup.exe` from the [latest release](../../releases/latest).
