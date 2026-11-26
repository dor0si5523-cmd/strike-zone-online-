# Ashen Vale — Browser RPG

A top-down action RPG that runs in modern desktop and mobile browsers. After login, choose a realm and one of three character slots. Create a warrior, archer, mage, or pirate gunner; each class has a distinct attack style. Explore the Greenwood frontier, fight slimes and goblins, complete quests, and earn experience and gold. Defeated monsters can drop equipment across five rarities. Equip four gear slots, enhance worn items with gold, or salvage extras. Optional auto hunt follows nearby monsters, attacks them, explores when none are nearby, and uses a potion at low health while the game is open.

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

Signup and login continue to use the existing GitHub-backed member store configured with `GITHUB_MEMBERS_TOKEN`. Realm rosters and character states are added alongside existing member fields; account credentials and legacy RPG records are retained. A legacy RPG save is copied into the first realm selected. Local automated tests use an in-memory store.

## Controls

- Desktop: WASD or arrow keys to move, Space to attack, E to talk, Q to use a potion, I to open equipment, F to toggle auto hunt.
- Touch screens: use the virtual stick and on-screen action buttons, including the auto hunt toggle.
