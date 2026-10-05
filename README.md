# Discord Server Announcements

A Discord bot for administrator-triggered DM announcements to members of the server where the command is run. Uses Discord.js 14 and Node.js 22.12.0 or newer.

## Setup

1. Install dependencies from the lockfile:

   ```sh
   npm ci
   ```

2. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications). On its **Bot** settings page, enable **Server Members Intent** and **Message Content Intent**. The former allows member fetching; the latter allows prefix commands. Verified applications may need approval for these [privileged intents](https://docs.discord.com/developers/events/gateway#privileged-intents).

3. Invite the bot to your server with **View Channels** and **Send Messages** permissions for the command channel.

4. Copy `.env.example` to `.env`. In PowerShell:

   ```powershell
   Copy-Item -LiteralPath .env.example -Destination .env
   ```

   Set `DISCORD_TOKEN` to your application bot token. Environment variables already set by your hosting provider take precedence over `.env`. Keep the token private; `.env` files are excluded from Git.

5. Start the bot:

   ```sh
   npm start
   ```

## Usage

A member with **Administrator** permission can run:

```text
!massdm Your announcement goes here
```

Each command sends the announcement once to non-bot members of the current server, including the sender. Members are fetched before delivery, so the recipient list is not limited to cached users. The DM identifies the server and command sender. Internal whitespace and line breaks are preserved. Announcement text must contain 1-4096 characters.

Delivery is sequential, with a configurable pause between attempts. Closed DMs count as failures and do not stop other recipients. The channel status is updated after delivery with actual sent, failed, and remaining counts. Only one announcement can run at a time in each server. Command messages stay visible for attribution.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | Required | Discord application bot token |
| `COMMAND_PREFIX` | `!` | 1-10 characters without whitespace |
| `DM_DELAY_MS` | `7000` | Pause between delivery attempts; 1000-60000 milliseconds |
| `PORT` | `3000` | HTTP health server port; 1-65535 |
| `HOST` | `0.0.0.0` | HTTP bind address |

Discord.js handles API rate limits; the configured pause is additional spacing between attempts. A failed credential stops the current broadcast. Errors are logged with context and error codes, without request bodies or announcement text.

`GET /health` and `GET /` return JSON with HTTP 200 when Discord is ready and HTTP 503 otherwise. Other paths return HTTP 404.

Ctrl+C or SIGTERM closes the health server, stops further delivery attempts, and disconnects the bot. An already in-flight request may finish. Jobs are kept in memory and are not resumed after a restart; review the last counts before repeating an interrupted announcement.

## Project layout

- `server.js`: client startup, health server, and shutdown.
- `events/message.js`: the single command dispatcher.
- `komutlar/yaz.js`: the `massdm` command.
- `util/broadcast.js`: paced delivery and results.
- `util/config.js`: environment validation.
- `util/commandLoader.js` and `util/eventLoader.js`: loading and event registration.
