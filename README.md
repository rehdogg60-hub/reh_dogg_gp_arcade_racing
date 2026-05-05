# REH DOGG GP: NEON RUN

Reh Dogg Games Plus Arcade lane-racing game built with HTML, CSS, JavaScript, and Three.js.

## Description

`REH DOGG GP: NEON RUN` is a clean cockpit-view arcade lane racer. The car drives forward automatically while the player switches between three lanes to dodge neon hazards.

The game cycles through five visual themes every 1,000 distance points:

- Tokyo Neon
- Sahara Desert
- Alpine Snow
- Forest Ridge
- Volcano Circuit

After Volcano Circuit, the themes loop back to Tokyo Neon. Speed increases over time, score is based on distance survived, and best score is saved with `localStorage`.

## Controls

Desktop:

- `A` or `Arrow Left`: Move one lane left
- `D` or `Arrow Right`: Move one lane right
- `Space` or `P`: Pause

Mobile:

- Use the large `LEFT` and `RIGHT` buttons.

## Folder Structure

```text
reh_dogg_gp_arcade_racing/
  index.html
  style.css
  game.js
  game_straight_backup.js
  README.md
```

`game_straight_backup.js` is a backup of an older pre-lane-racer version.

## GitHub Pages

Upload the `reh_dogg_gp_arcade_racing` folder to the root of your GitHub Pages repository.

The game should load at:

```text
https://rehdogg60-hub.github.io/reh_dogg_gp_arcade_racing/
```

No build tools or npm install are required. The game can also run locally by opening `index.html` in a browser with internet access for the Three.js CDN.
