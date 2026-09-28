# Organisor

Local daily organizer: **Today’s planner** (left) plus an **Eisenhower task matrix** (right). Data stays in your browser via `localStorage`.

## Repository

| Remote | URL |
|--------|-----|
| **GitHub** (target) | `https://github.com/clarkie82-dev/organisor` |
| **Cursor Origin** | `https://origin.cursor.com/git/aj-c/tmp-b2d0f0d89c0f011f` |

After cloning, add GitHub if needed:

```bash
git remote add github https://github.com/clarkie82-dev/organisor.git
git push -u github main
```

## Run locally

**Option A — open the file**

1. Clone or copy this folder to your PC.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox).

**Option B — simple local server** (recommended if your browser restricts file URLs)

```bash
cd /path/to/organisor
python3 -m http.server 8765
```

Then visit `http://localhost:8765`.

## Features (v1)

- **Planner:** “Right now” shows the current schedule block or, in a gap, the top open task (Eisenhower order, then required-by date).
- **Schedule:** Add time blocks for **today** only.
- **Tasks:** Four quadrants; drag tiles between them; collapsed tile shows short description only; expand for notes, required-by date, and who.
- **Complete:** Tasks move to the **Archive** drawer with a completion timestamp.
- **Required-by dates:** Flatpickr calendar (DD/MM/YYYY); bundled under `vendor/flatpickr/`.

## Data

Stored under keys `organisor_activeTasks`, `organisor_archivedTasks`, and `organisor_schedule_YYYY-MM-DD` in `localStorage` for this origin.
