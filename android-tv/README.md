# Kids TV for Android TV / Google TV

A thin app shell that shows the Kids TV page (`../index.html`, served by GitHub Pages)
full screen on a TV. It:

- forwards the remote's buttons to the page by calling `window.__kidsTvKey(name)`,
  which is defined in `../tv.js` (loaded only inside this app, never on phones);
- refuses to open any address other than the Kids TV page;
- keeps the saved list on the TV (same `kidsTV.v1` storage key as the phone).

Build with `./build.sh <keystore> <password>`; the result is `build/kidstv.apk`.

The signing keystore is deliberately not stored in this repository. An app rebuilt
with a different keystore cannot update an installed copy in place: uninstall the
old Kids TV app on the TV first (its saved list is lost, so copy the backup code).
Most changes belong in `tv.js` or `index.html`, which update without reinstalling.
