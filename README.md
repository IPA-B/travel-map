# Travel Map

Travel Map is a React + TypeScript travel journal that renders a world map with place markers, a gallery for each trip, and optional media/Spotify playback. It is designed to work as a static site and to load travel data from a JSON file at runtime.

## Features

- Full-screen Leaflet map with place markers
- Per-place photo/video gallery
- Local file or Spotify track playback
- Optional encrypted media support
- Data URL and encryption key configuration in the app
- Localized welcome text and place titles
- Static hosting friendly deployment model

## Quick start

```bash
npm install
npm start
```

Then open the local URL printed by webpack-dev-server in your browser.

## Data format

The app reads travel data from the configured data URL. The default is `./data/data.json`.

You can host the JSON file and the gallery assets on any static file service that allows public access and does not block CORS, such as Cloudflare R2 or similar providers.

Example:

```json
{
  "welcome": {
    "title": { "default": "Travel Map" },
    "message": { "default": "Explore travels around the world." }
  },
  "places": [
    {
      "id": "paris-2023",
      "date": "2023-05-01",
      "title": { "default": "Paris, France" },
      "latitude": 48.8553,
      "longitude": 2.3451,
      "tracks": ["spotify:track:..."],
      "gallery": ["./paris-2023/image.jpg", "./paris-2023/video.mp4"]
    }
  ]
}
```

Notes:

- `welcome.title` and `welcome.message` are localized strings, with `default` as the fallback value.
- Each place includes `id`, `date`, `title`, `latitude`, `longitude`, and optional `tracks` / `gallery` arrays.
- Local media entries may be relative paths such as `./images/photo.jpg` or encrypted URIs with the `encrypted:` prefix.

## Encrypt local data files

Use `scripts/encrypt-data.ps1` with PowerShell 7.2 or newer. The script resolves local `./` file references relative to the input `data.json`, encrypts media from the `gallery` and `tracks` fields with AES-GCM, and leaves already-encrypted `encrypted:./...` files unchanged.

Behavior summary:

- Output is written to a new directory, or to a custom directory passed via `-OutputDirectory`.
- The generated `data.json` is rewritten to reference encrypted assets as `encrypted:./<sha256>`.
- Asset files are written directly into the output directory using a hash-based filename.
- The script stores a keyed fingerprint/IV cache in `scripts/encrypt-data.json` by default so repeated runs with the same file and key produce the same encrypted output.
- The cache is authenticated and intentionally deterministic for identical content. Keep it private; do not edit or delete it while continuing to encrypt with the same key.

Example:

```powershell
$encryptionKey = Read-Host -Prompt 'Encryption key' -AsSecureString
.\scripts\encrypt-data.ps1 -DataPath .\data\data.json -EncryptionKey $encryptionKey
```

Optional arguments:

```powershell
.\scripts\encrypt-data.ps1 -DataPath .\data\data.json -EncryptionKey $encryptionKey -OutputDirectory .\encrypted-data
.\scripts\encrypt-data.ps1 -DataPath .\data\data.json -EncryptionKey $encryptionKey -CachePath C:\private\encrypt-data.json
```

Keep both the encryption key and the cache file safe. The key is required to view encrypted media, and the cache is required to reproduce the same encrypted files later.

## Spotify

If you want Spotify playback, create your own app in the Spotify Developer Dashboard and replace the client ID used by the app with your own value.

## Build and deploy

This is a static React app. Build it with:

```bash
npm run build
```

Then publish the generated output to any static host.

### GitHub Pages

1. Push the project to GitHub.
2. Open the repository settings and choose **Pages**.
3. Set the source to **GitHub Actions**.
4. Push to the main branch and wait for the workflow to finish.
5. Use the URL shown in the GitHub Pages settings or Actions output.

This project is ready to be published as a GitHub Pages site without changing the application code.