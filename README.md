# Ashen Vale — Browser RPG

A top-down action RPG that runs in modern desktop and mobile browsers. Explore the Greenwood frontier, fight slimes and goblins, complete quests, earn experience and gold, and continue your character from the same account on another device. Defeated monsters can drop equipment across five rarities. Equip four gear slots, enhance worn items with gold, or salvage extras. Optional auto hunt follows nearby monsters, attacks them, explores when none are nearby, and uses a potion at low health while the game is open.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open http://localhost:3000. Automated browser tests use an isolated in-memory account store and never write to the production member repository:

```sh
npm test
```

## Accounts and saves

Signup and login continue to use the existing GitHub-backed member store configured with `GITHUB_MEMBERS_TOKEN`. The RPG app only adds an `rpg` field to the signed-in member record. It leaves account credentials and every existing member field intact. Local automated tests use an in-memory store.

## Controls

- Desktop: WASD or arrow keys to move, Space to attack, E to talk, Q to use a potion, I to open equipment, F to toggle auto hunt.
- Touch screens: use the virtual stick and on-screen action buttons, including the auto hunt toggle.
