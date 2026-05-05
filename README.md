# REH DOGG GP

Reh Dogg Games Plus Arcade racing game built with HTML, CSS, JavaScript, and Three.js.

## Description

Race through five arcade stages:

- Tokyo Neon
- Sahara Desert
- Alpine Snow
- Forest Ridge
- Volcano Circuit

Each stage has 3 laps, curved loop-style racing, checkpoint gates, tunnel moments, mobile controls, Web Audio engine sound, stage completion screens, and best lap saving with `localStorage`.

## Controls

Desktop:

- `W` or `Arrow Up`: Accelerate
- `S`, `Arrow Down`, or `Space`: Brake
- `A/D` or `Arrow Left/Right`: Steer

Mobile:

- Use the on-screen left, right, gas, and brake buttons.

## Folder Structure

```text
reh_dogg_gp_arcade_racing/
  index.html
  style.css
  game.js
  game_straight_backup.js
  README.md
```

`game_straight_backup.js` is a backup of the earlier straight-track version before the loop/checkpoint upgrade.

## GitHub Pages

Upload the `reh_dogg_gp_arcade_racing` folder to the root of your GitHub Pages repository.

The game should load at:

```text
https://rehdogg60-hub.github.io/reh_dogg_gp_arcade_racing/
```

No build tools or npm install are required. The game can also run locally by opening `index.html` in a browser with internet access for the Three.js CDN.
