# UzTiers

**UzTiers O'zbekistondagi o'yinchilarning Minecraft PvP darajalarini aniqlaydigan loyiha.**
UzTiers is the national Minecraft PvP tierlist of Uzbekistan — a community of 1,000+ players testing to find their place on the leaderboard.

- Website / leaderboard: [uztiers.com](https://uztiers.com)
- Minecraft server: `uztiers.uz`

This repository contains the **UzTiers Discord bot** and its **web staff panel** — the infrastructure that runs testing across all UzTiers kit servers.

## How testing works

1. A player verifies with their Minecraft nickname.
2. They join the automatic testing queue in their kit's Discord server.
3. A tester fights them and assigns a tier based on performance.
4. Higher tiers (LT3+) go through a separate high-test ticket flow against higher-tier testers.
5. Results sync to a MySQL database that powers the public leaderboard on uztiers.com.

Kits: **Sword, Axe, Mace, NethPot, Potion, SMP, UHC, Vanilla, Crystal** — each with its own Discord server.

## Features

- **Verification** — Minecraft nickname linking with a global profile shared across all UzTiers servers
- **Queue & testing flow** — single auto-updating queue message, tester commands (`/start`, `/next`, `/stop`, `/close`)
- **High-tier tests** — ticket system with result logging (`/highresult`)
- **Tier management** — `/tier`, `/demote`, `/deletetier`, retired/unretired players, cross-server nickname changes with tier transfer
- **Cooldowns & restrictions** — per-category cooldowns, timed restrictions with automatic expiry
- **Leaderboards** — top 10 monthly and all-time, refreshed automatically
- **Tester applications & support tickets** — button/modal driven, with duplicate-ticket protection
- **Staff logging** — every staff action logged to dedicated channels
- **Web panel** (`panel/`) — staff dashboard for tickets, events, settings and history
- Uzbek-language interface, Discord Components V2 design

## Tech stack

- Node.js, [discord.js v14](https://discord.js.org)
- MySQL (`mysql2`)
- Plain Node `http` server for the staff panel

## Setup

```bash
git clone https://github.com/UmarBlade/UzTiers.git
cd UzTiers
npm install
cp .env.example .env   # fill in your bot token and database details
node setup_discord_db.js   # create database tables
npm start
```

`guildKitModes.json` maps each Discord server ID to its kit — edit it for your own servers.

## Project structure

| Path | Purpose |
|---|---|
| `bot.js` | Main bot: commands, queue, tickets, leaderboards |
| `db.js` | MySQL tier database layer |
| `userIdentity.js` | Cross-server player identity / nickname handling |
| `setup_discord_db.js` | Database setup script |
| `fix-old-nick-tiers.js` | Maintenance script for tier transfers after nickname changes |
| `panel/` | Web staff panel (server + frontend) |
| `icons/` | Icons used in bot messages |

## Author

Built by [UmarBlade](https://github.com/UmarBlade) — founder of UzTiers.
