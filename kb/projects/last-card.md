---
title: LastCard!
name: LastCard!
status: Deployed
summary: Nigeria's favourite card game, online and multiplayer.
stack: Node.js, Express, Mongodb, JQuery, Redis
live: https://lastcard.paulobike.com
liveLabel: Play now
code: Private github repo
---
# LastCard!

## Overview
- An online, real-time multiplayer version of Whot, the Nigerian card game.
- Players join rooms with friends, play by house rules and call "Last card!".
- Players can also play with bots of different difficulty level if no friends are available

## Details

### What was built

- **Rules engine:** written in pure functions with no I/O, covering the standard Whot special cards:
  - Hold on (1), Pick two (2), Pick three (5), Suspension (8), General market (14), and Whot (20), which can call any shape.
  - "Last card" is called automatically, and a round that nobody can finish is decided on fewest cards, then fewest points.
  - The host can turn Pick three, Suspension and Whot cards on or off for each game.
- **Authoritative real-time server:** built on Socket.IO.
  - The server holds the game state and decides which moves are legal.
  - Each player receives only their own view, so other players' hands never reach their browser.
  - A turn timer, seat holds and reconnecting all survive dropped connections.
- **Lobby and table interface:** shareable codes and QR codes, a host who controls the house rules and deal size, card animations, announcements such as "Hold on!" and "Last card", and a rejoin card on the home page.
- **Voice chat:** WebRTC between the seated players. Cloudflare TURN credentials are issued per session and expire quickly, so voice works even behind strict networks.
- **Guest profiles and optional accounts:** a guest can turn their profile into a real account and keep their name and history. Stats, a played-games record and an activity log are kept.
- **Computer opponents:**
  - **Easy** plays a random legal card.
  - **Medium** saves its Whot card, sticks to its strongest shape and defends when the next player is about to win.
  - **Hard** adds planning over the whole turn (chains of Hold on and Pick two), counting the cards already played, and notes on which shapes each opponent couldn't follow.
  - A bot sees only what a player at the table would see. A test confirms that its choices don't change when hidden cards are shuffled around.
  - The levels were checked over 20,000 self-play games per pairing. Medium beats Easy by about 10 to 14 percentage points, and Hard beats Medium by about 7.
- **Bot fill-in and forfeit:**
  - If a player drops out mid-round, a Medium bot plays their hand after a 60-second grace period, and they take it back when they reconnect.
  - Players can switch this off on their profile and forfeit instead. Their seat then shows "Left this round" and they're listed last as "Forfeited".
  - Rounds with seated bots are kept out of everyone's stats.
- **Round-over flow:** the winning card lands on the pile and the table holds for 1.5 seconds. The results then open with the winning card shown at the top, and a "See the table" button lets players look at the final table.
- **Persistence and scaling:** live games are kept in Redis, so a server restart doesn't end them, and several server instances can share the same games.

### The hardest problem

The hardest problem was running live games across several server instances without two servers ever changing the same game at once.

A Whot table is shared state that changes fast:

- Moves arrive over WebSockets that may be connected to different servers.
- Turn timers, seat holds and reconnect deadlines have to fire exactly once.
- A server can crash in the middle of a game.

The solution has four parts:

1. **One lock per game in Redis.** Every change to a game runs inside a lock that loads the game from Redis, applies the change and saves it.
2. **Shared timers.** All timers live in a Redis sorted set. A Lua script lets exactly one instance claim each timer that falls due. A timer found far past its deadline means no server was running when it was due, so the player gets a fair grace period instead of an instant timeout.
3. **Shared presence and crash cleanup.** Who is connected lives in a Redis hash, and each instance sends a heartbeat. A sweeper treats connections belonging to a dead instance as players who left, and they get the normal seat-hold rules.
4. **Cross-instance messages.** Messages reach players on other instances through the Socket.IO Redis adapter.

The same store contract runs against an in-memory store and against real Redis in tests. End-to-end tests start a real server against Redis and MongoDB.

A close second was making the bots fair and measurably different in strength. The engine had to be pure and fast enough for tens of thousands of self-play games; replacing a deep-copy step made the engine about 4.5x faster. Hard only pulled ahead of Medium after the scoring signals were tuned with a self-play ladder script that reports 95% confidence margins.

### Stack

- **Backend:** Node.js, Express 4, EJS server-rendered pages, Passport (local strategy) with express-session.
- **Real time:** Socket.IO 2 with the socket.io-redis adapter, and WebRTC voice chat using Cloudflare TURN.
- **Data:** MongoDB through Mongoose for users, games, played-game records and the activity log. Redis through ioredis for live game state, locks, timers and presence.
- **Frontend:** jQuery and plain CSS built on design tokens, with light and dark themes, a layout that works on phones, and respect for the reduced-motion setting.
- **Testing:** Node's built-in test runner, with full line coverage on the rules engine and the bot logic. The tests include fuzzing across every rule combination and deal size, a self-play strength ladder, and end-to-end tests that drive real Socket.IO clients against a running server.
- **Deployment:** a VPS behind nginx.

