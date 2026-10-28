# Overwatchdle

An Overwatch-themed guessing game. A secret hero is picked at random on load; guess heroes and compare their attributes until you find the right one.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure: title, hint cards, search box, guess grid |
| `style.css` | Styling, colors, animations, background picture |
| `script.js` | Game logic: loading data, autocomplete, comparison, hints |
| `heroes.json` | Hero data (one object per hero) |
| `background.jpg` | *Optional.* Your own background picture |

Keep all files in the same folder.

## Running it

The game loads `heroes.json` with `fetch()`, which browsers block when you open `index.html` directly from disk. Serve the folder with a local web server instead:

```bash
# Python
python -m http.server 8000

# or Node
npx serve
```

Then open `http://localhost:8000`.

An internet connection is needed for the Google Fonts (Teko, Metrophobic) and for the hero portraits, which load from the URLs in `heroes.json`.

## How to play

1. Type a hero name and pick from the dropdown (mouse, or `↑` / `↓` and `Enter`).
2. A row appears comparing your guess to the secret hero:
   - **Green**: matches the secret hero.
   - **Red**: does not match.
   - **Health / Year**: an arrow shows which way the secret hero's value lies. `↑` means higher, `↓` means lower.
3. Hints unlock as you make guesses. Click an unlocked card to reveal it.
4. Guess correctly and the input locks and a win message shows your guess count. Reload the page for a new secret hero.

## Daily mode, stats and sharing

- **Daily hero:** everyone gets the same hero on the same date (based on the local date). Your guesses are saved in the browser, so a reload restores them.
- **Random hero:** the toolbar button starts an unsaved practice game. It doesn't affect stats.
- **Stats:** wins, streak, best streak, average guesses and a guess distribution (daily games only).
- **Share:** after a win, "Copy result" produces an emoji grid (🟩 match, 🟨 close, 🟥 miss, ⬆️/⬇️ for Health and Year) without revealing the hero.
- **Yellow tiles:** Species, Origin and Affiliation turn yellow when the guess shares a word with the answer (e.g. "Talon" vs "Talon (Formerly)"). Set `PARTIAL_FIELDS` to `false` in `script.js` to turn this off.
- Saved data lives in `localStorage` (`owdle-save`, `owdle-stats`); clear site data to reset.

## Modes, sound and accessibility

- **Modes:** Daily, Random and **Quote** (a voice line is shown and you guess who said it; the Quote hint card is hidden in this mode). Only Daily is saved and counted in stats.
- **Sound & confetti:** tile sounds play as a row flips in, with a short fanfare and confetti on a win. Sounds are generated in the browser (no audio files). Use the Sound button to mute; the choice is remembered. Confetti is skipped if the system asks for reduced motion.
- **Accessibility:** tiles carry symbols (✓ match, ~ close, ✗ miss) so colors aren't the only signal, hover tooltips, and screen-reader labels.
- **Mobile:** below 700px each guess becomes a labelled card instead of a wide grid.

## Customizing

**Hint unlock thresholds** (`script.js`, top of the hints section):

```js
const HINT_UNLOCKS = { quote: 3, roleSpecies: 5, origin: 7 };
```

Numbers are how many guesses must be made before each hint can be opened.

**Background picture**

- Permanent: save an image as `background.jpg` beside `index.html`. To use another filename, edit `--bg-image` at the top of `style.css`.
- Temporary: use the "Change background" button (bottom-right). It resets on reload.
- Readability: lower the overlay opacity values (`.72` and `.9`) in `body::before` in `style.css` to let more of the picture show.

**Colors**: edit the variables at the top of `style.css` (`--bg`, `--accent`, `--green`, `--red`, `--glass`).

**Heroes**: add, remove or correct entries in `heroes.json`. Every hero needs these fields:

```json
{
  "name": "Tracer",
  "role": "Damage",
  "gender": "Female",
  "species": "Human",
  "origin": "United Kingdom",
  "affiliation": "Overwatch",
  "health": 175,
  "releaseYear": 2016,
  "image": "https://example.com/tracer.png",
  "quote": "Cheers, love! The cavalry's here!"
}
```

Tips:

- Tiles are compared by exact text, so keep spelling consistent (for example always `"USA"`, not sometimes `"United States"`). The same goes for species and affiliation values.
- `health` and `releaseYear` must be numbers, not strings.
- `image` is optional. If it is missing or fails to load, the portrait is simply left out.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not load heroes.json" message | Serve the folder with a local web server (see above) and check the file is named `heroes.json` |
| Nothing happens when typing | Check the browser console for a JSON syntax error in `heroes.json` (often a missing comma) |
| Background picture doesn't show | Confirm the file is named `background.jpg` and sits next to `index.html` |
| Hints won't open | They are locked until enough guesses have been made; the card shows how many remain |
