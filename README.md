# Travel Map

Interactive travel journal built with React, TypeScript, and Leaflet. Each place can include a location, date, gallery, and tracks.

## Data

The app reads travel data from the configured URL in settings. Default is `./data/data.json`.

You can create the `data.json` file and the gallery on any file storage service that lets you share files, such as Cloudflare R2 or similar providers, and either supports CORS configuration or does not enforce it.

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

## Features

- Full-screen map and markers
- Photo/video gallery per place
- Spotify/file track playback
- Optional encrypted data support
- Settings for data URL and encryption key
- Sharing your settings with others
- Localized titles/messages support

## Encrypt local data files

Use `scripts/encrypt-data.ps1` with PowerShell 7.2 or newer. It resolves local `./` file references relative to the input `data.json`, encrypts those files in `gallery` and `tracks` using the configured AES-GCM format, and copies already encrypted `encrypted:./` files unchanged. All hash-named assets are written directly into the output directory without preserving their source folder structure. The copied `data.json` is updated to reference each asset as `encrypted:./<sha256>`, relative to that output file. Without `-OutputDirectory`, output goes to an `__encrypted-yyyyMMdd-HHmmss` folder next to the input file.

The script caches keyed file fingerprints and IVs in `scripts/encrypt-data.json` so the same file and key produce the same encrypted bytes on later runs. The cache contains no file contents, is authenticated, and is not placed in the generated output. It is ignored by Git, but keep it private and do not delete or edit it while continuing to encrypt with the same key; a modified cache is rejected. Run only one instance at a time with the same cache. Reusing an IV is limited to content with the same keyed SHA-256 fingerprint, and intentionally reveals when file contents match. This is a deliberate deterministic-reuse tradeoff; do not reuse the IV for different content. Use `-CachePath` to select a different private cache location; a cache is bound to the encryption key.

```powershell
$encryptionKey = Read-Host -Prompt 'Encryption key' -AsSecureString
.\scripts\encrypt-data.ps1 -DataPath .\data\data.json -EncryptionKey $encryptionKey
```

To choose an output folder, pass `-OutputDirectory .\encrypted-data`. To choose a cache location, pass `-CachePath C:\private\encrypt-data.json`. Keep the encryption key and cache safe; the key is required to view encrypted media, and the cache is required to reproduce the same encrypted files later.

## Spotify

If you plan to use Spotify playback, create your own Spotify app in the Spotify Developer Dashboard and replace the client ID in the Spotify module with your app's client ID.

## Deploy and run

This is a static React app. Run `npm run build` and publish the generated output to any static host.

### Build

```bash
npm run build
```

### Run locally

```bash
npm install
npm start
```

Then open the local URL from webpack-dev-server.

### GitHub Pages

1. Push the project to GitHub.
2. In the repository settings, open **Pages**.
3. Set the source to **GitHub Actions**.
4. Push to the main branch and wait for the workflow to finish.
5. Use the published URL from the GitHub Pages settings or Actions output.

This project is ready to be published as a GitHub Pages site without changing the app code.