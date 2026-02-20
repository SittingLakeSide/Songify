# Song App (no-install)

A lightweight **Song Library + Queue + Audio Player** that runs as a static site (no Node/npm needed).

## Run

Open `index.html` in your browser.

If your browser blocks audio URLs due to CORS, use local files (temporary) or run a tiny local server:

- PowerShell (Python installed):

```powershell
cd "c:\Users\Desktop\SongProject1"
python -m http.server 5173
```

Then open `http://localhost:5173`.

## Features

- Library: add/edit/delete songs, search, sort
- Player: play/pause, seek, volume, shuffle, repeat (off/all/one)
- Queue: add tracks, reorder, remove, clear
- Persistence: library + queue saved in `localStorage`
- Import/Export: JSON library import/export

## Notes

- **Audio URLs** persist across sessions.
- **Local files** are supported via `blob:` URLs and are **temporary** (they won’t survive a refresh).


