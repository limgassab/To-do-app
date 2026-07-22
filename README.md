# Daily Work Log

A simple installable web app for:

- daily work entries by project
- tasks with due dates and priorities
- end-of-day summaries
- project-level progress
- history by date and project
- offline use
- JSON backup and restore

The first version stores all information locally in the browser. No account or server is required.

## Run locally

Because the app includes a service worker, open it through a small local web server rather than double-clicking `index.html`.

### Python

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### VS Code

You can also use the Live Server extension and open `index.html`.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder, including the `.github` folder.
3. Open **Settings → Pages** in the repository.
4. Under **Build and deployment**, choose **GitHub Actions**.
5. Push to the `main` branch. The included workflow will publish the app.

## Install on a phone or computer

After opening the published site:

- Android/Chrome: open the browser menu and select **Install app** or **Add to Home screen**.
- iPhone/Safari: select **Share → Add to Home Screen**.
- Desktop Chrome/Edge: use the install icon in the address bar.

## Data and privacy

Data is stored in the current browser using `localStorage`. Use **Backup → Export backup** regularly. Browser clearing, private browsing, or changing devices can remove or separate your data.

## Main files

- `index.html` — app structure
- `styles.css` — responsive visual design
- `app.js` — projects, tasks, history, local storage, import/export
- `manifest.webmanifest` — installable PWA configuration
- `sw.js` — offline cache
- `.github/workflows/deploy.yml` — GitHub Pages deployment
