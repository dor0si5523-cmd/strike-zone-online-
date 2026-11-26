# Ashen Vale — Browser RPG

Ashen Vale is a mobile and desktop browser RPG with automatic combat. Characters choose one of four classes (warrior, archer, mage, or pirate gunner), progress through three level-gated regions, and fight region monsters and bosses. Gear is obtained through gold or free-cash summons; monster hunts do not award equipment. Duplicate conversion, summon pity, summon history, enhancements, and inventory management are included.

Character saves include auto-combat preferences, attendance and hunt rewards, region progress, companion growth, achievements, mailbox claims, monster collection, and personal records. Optional account community systems include opt-in character rankings, invitation-code clans, member-only clan rosters, and a shared weekly clan hunt. Authenticated players can also create or join real-time co-op regional boss raids for up to four characters; raid room membership shares only the selected character name, class, level, and raid damage with room participants. Rankings show only the chosen alias, class, level, and score; account IDs and credentials are never published in ranking entries.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open http://localhost:3000. The default development flow starts at character creation and stores that character in the current browser. Append `?account=1` to use the existing login, realm, and character-slot flow.

Automated browser tests use an isolated in-memory account store and never write to the production member repository:

```sh
npm test
```

## Accounts and saves

Signup and login use the existing GitHub-backed member store configured with `GITHUB_MEMBERS_TOKEN`. Realm rosters and RPG character states are stored alongside existing member fields; credentials and legacy member data are retained. Community ranking and clan data use a separate `members/public-rankings.json` file in that backing repository. Ranking participation is off until a player explicitly opts in.

## Operations

The in-game notice and operations panel is limited to usernames in the Render environment variable `RPG_ADMIN_USERS`, as a comma-separated allowlist. It displays service uptime, active session count, opt-in ranking count, and clan count; it supports publishing and removing public notices. It does not expose member account names, credentials, or character save records.

## Gameplay

Combat and movement run automatically while the game is open. Configure engagement range, target selection, and potion use in the equipment panel. Touch controls are not needed for movement or attacking. The game does not process real-money payments. Real-time raids use Socket.IO and require an authenticated account character; the browser-only development character cannot join online rooms.
