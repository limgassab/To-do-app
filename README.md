# Daily Work Log v2

This version is a static installable web app for GitHub Pages.

## Important: every file is in the same folder

Upload all of these files directly to the root of your GitHub repository:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`
- `README.md`

There are no icon folders and no hidden deployment folders.

## GitHub Pages settings

In the repository, open:

`Settings` → `Pages`

Choose:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

Then wait a few minutes for GitHub Pages to update.

## Updating an existing installation

This version uses the same local-storage key as version 1, so your existing projects, tasks, entries, and reviews should remain available when you replace the files in the same repository.

After uploading the new files, refresh the app. If the old design appears briefly, close the installed app completely and open it again so the updated service worker can take control.

## Main corrections in v2

- Cancel and close buttons work without triggering form validation.
- All app files are in one flat folder.
- The design is blue rather than purple.
- The app icon uses a strong white checkmark on blue.
- The mobile layout and forms are simpler.
- Work-entry editing now has its own Cancel edit button.
