# Dream Test XI

Draft two all-time Test XIs with a friend, then watch the same five-day Test play out over by over on both screens.

**How a game goes**

1. One player creates a room and sends the 5-letter code (or the invite link) to the other.
2. The game picks at random who is Team A and who is Team B.
3. Snake draft from the full list of rated legends (a player can be drafted once, whichever role he is listed under): A picks 1, then B picks 2, A 2, B 2, and so on until both XIs are full. The game blocks any pick that would leave a side without a keeper or with fewer than 4 bowling options.
4. Each player sets their own batting order.
5. Coin toss. The winner chooses to bat or bowl on a randomly drawn pitch.
6. The Test is simulated over by over. Pause, speed and the skip buttons are shared, so both screens always show the same ball.

There is also a "Play on this device" mode that needs no room: pick both XIs yourself and run a Test.

## Put it online (GitHub, then Vercel)

1. **GitHub.** Create a new repository, then upload everything in this folder (the contents, not the zip). On github.com use *Add file, Upload files* and drag the folders in. Keep the structure: `public/`, `api/`, `src/` and the files next to them.
2. **Vercel.** On vercel.com choose *Add New, Project* and import the repository. Framework preset: *Other*. Leave the build and output settings alone, `vercel.json` already points Vercel at `public/`. Press Deploy.
3. **Redis.** Rooms are stored in a small Redis database, so the site needs one. In the Vercel project open the *Storage* tab, choose *Create Database*, pick *Upstash for Redis* from the Marketplace, take the free plan and connect it to the project for all environments. This adds the variables `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the code also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`).
4. **Redeploy.** New environment variables only reach new deployments. Open *Deployments*, pick the latest one, choose *Redeploy*.
5. **Check.** Open `https://YOUR-SITE.vercel.app/api/room`. It should show `{"ok":true,"storage":true}`. If it shows `"storage":false`, the Redis variables are missing, so repeat steps 3 and 4.

If the home page says "Online rooms are not switched on yet", that is the same problem.

## Run it on your own computer

You only need Node 22 or newer. No packages to install.

```
node local-server.js
```

Open http://localhost:3111. Rooms are kept in memory in this mode, so open the page in two browser windows (use a private window for the second, since each browser stores one player id) to play both sides.

## Editing the game

The readable source is in `src/`. After a change, run:

```
node build.js
```

That rebuilds `public/index.html` (all code and styles in one file) and `api/_lib.js` (the player table and draft rules the server checks picks against). Commit both generated files.

| File | What it holds |
| --- | --- |
| `src/players.js` | The rated players, by category |
| `src/profiles.js` | Batting and bowling profiles, XI rules, draft rules |
| `src/engine.js` | The match simulation (seeded, so two screens get the same match) |
| `src/app.js` | Team picking, match screen, scorecards, solo mode |
| `src/online.js` | Rooms, draft, toss, shared playback |
| `api/room.js` | The single server endpoint for rooms |

## How the sync works

There is no live socket. The server keeps one small record per room in Redis: the draft picks, batting orders, toss result, pitch, a random seed and a shared playhead (which over we are at, playing or paused, speed). Both browsers run the same simulation from the same seed, so the match is identical, and each follows the shared playhead using the server's clock. Browsers poll the server about once a second. Writes use compare-and-set, so two players acting at the same moment cannot overwrite each other.

Rooms expire six hours after their last change.

## Limits worth knowing

- A room holds two players. A third person gets "This room is full."
- A player id lives in the browser, so use one browser tab per player. Reloading the page puts you back in your room.
- Leaving a game under way keeps your room code, so you can press *Join room* to step back in. Leaving a lobby is final.
- While a room is open each player makes roughly one request per second to Redis. Check your Redis plan's command allowance if you plan to leave games open for hours.
