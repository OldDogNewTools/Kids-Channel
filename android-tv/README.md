# Kids TV app shell (Android TV / Google TV and touch tablets)

A thin app that shows the Kids TV page (`../index.html`, served by GitHub Pages)
full screen and refuses to open any other address. One app file, two modes:

- **TV** (no touch screen): loads `../tv.js`, which lets the remote move a
  highlight, select, and pause / skip / close videos. The shell forwards remote
  buttons by calling `window.__kidsTvKey(name)`.
- **Tablet** (touch screen, including Fire tablets): loads `../tablet.js`, which
  adds a daily time limit with a "Time's up" lock screen and a Screen time card
  in the grown-up settings. The shell hides the system bars, handles the Back
  button through `window.__kidsBack()`, and can pin the app to the screen when
  the page asks through `prompt("kidstv:pin")` / `prompt("kidstv:unpin")`.

Neither helper file is loaded by the plain web page, so phones are unaffected.
The video list stays under the `kidsTV.v1` storage key; the timer uses
`kidsTV.timer.v1`. Each device keeps its own copy of both.

Build with `./build.sh <keystore> <password>`; the result is `build/kidstv.apk`.

The signing keystore is deliberately not stored in this repository. An app rebuilt
with a different keystore cannot update an installed copy in place: uninstall the
old Kids TV app first (its saved list is lost, so copy the backup code).
Most changes belong in `tv.js`, `tablet.js` or `index.html`, which update without
reinstalling.
