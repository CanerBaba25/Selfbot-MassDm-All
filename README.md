# Discord Server Announcements

Administrator commands for DM announcements in the server where each command is run. Uses Discord.js 14 and Node.js 22.12.0 or newer.

## Setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Create an application bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enable **Server Members Intent** and **Message Content Intent** on its **Bot** page. These allow fetching members and reading prefix commands; verified applications may need approval for [privileged intents](https://docs.discord.com/developers/events/gateway#privileged-intents).
3. Invite the bot with **View Channels** and **Send Messages** permissions in the command channel.
4. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` to your application bot token. In PowerShell:

   ```powershell
   Copy-Item -LiteralPath .env.example -Destination .env
   ```

5. Run `npm start`. Keep `.env` private. Existing environment variables take precedence over the file.

## Commands

All commands require **Administrator** permission and must be used inside a server. The default prefix is `!`; change it with `COMMAND_PREFIX`.

| Command | Action |
| --- | --- |
| `!dm @user [message]` | DM one non-bot member of this server. |
| `!dmpreview [message]` | Send the announcement to your own DMs first. |
| `!dmall [message]` | DM every non-bot member of this server, including you. `!massdm` is an alias. |
| `!dmallsafe [message]` | Send to all members using the slower schedule below. |
| `!dmroleall @Role [message]` | DM non-bot server members who have the role. |
| `!dmroleallsafe @Role [message]` | Send to the role using the slower schedule. |
| `!dmretry <success_log_file>` | Retry failed recipients from the referenced campaign. |
| `!dmstatus` | Show the active campaign or latest recorded status and counts. |
| `!dmstats [days]` | Show successful/failed delivery attempts over 1-365 days; default 7. |
| `!dmcancel` | Request cancellation of the current server's campaign. |
| `!dmestimate <recipient_count> [safe]` | Estimate waiting time for 1-100000 recipients; add `safe` for slower pacing. |
| `!dmhelp` | Show the command list. |

User and role commands also accept a raw Discord ID. Omit `[message]` to use `DEFAULT_MESSAGE`; otherwise provide 1-4096 characters. Internal whitespace and line breaks are preserved. Each DM identifies the server and administrator who started it.

```text
!dmpreview The event starts at 19:00.
!dmroleall @EventParticipants The event starts at 19:00.
!dmstatus
```

Members are fetched before delivery. Only one delivery campaign runs at a time per server. Closed DMs count as failures; the bot continues to other recipients and posts progress, cooldowns, and final sent/failed/remaining counts.

## Delivery schedule

Normal broadcasts and retries wait **1 second between attempts**, plus an extra **5 minutes after each 20 attempts before the next recipient**. Failed attempts count toward the 20. `DM_DELAY_MS` changes the normal delay; the 5-minute break stays fixed.

The `safe` commands wait **4 seconds between attempts**, with these additional breaks:

| Completed attempts | Extra break before the next attempt |
| --- | --- |
| Every 100 | 8 minutes |
| Every 40 | 4 minutes |
| Every 15 | 90 seconds |

When milestones overlap, apply only the first matching rule in the order **100, 40, 15**. Failed attempts count. Neither schedule adds a delay or cooldown after the final recipient. Single-user DMs and previews need no broadcast cooldown.

Discord.js handles API rate-limit waits in addition to this schedule. Slower pacing does not guarantee that Discord will allow every DM. Estimates are lower bounds for configured waits; member fetching, message delivery, log writes, and API waits add time.

## Logs, retries, and stopping

Campaigns write metadata and success/failed `.jsonl` files to `logs/`. The completion message and `!dmstatus` show a filename such as `dm_success_<campaign UUID>.jsonl`. Pass that basename to `!dmretry`, without a directory path.

Retry uses the original message and only recipients recorded as failed in that campaign who are still eligible members of this server. It skips anyone already reached successfully anywhere in the same retry chain. Recipients that were never attempted are not included. Re-running `!dmall` starts a separate campaign and can send another copy.

`!dmcancel`, Ctrl+C, or SIGTERM stop further attempts; an in-flight request may finish. Campaigns do not resume automatically after a restart. Use `!dmstatus` to review interrupted runs before starting another campaign.

Logs contain plaintext announcement text and recipient IDs. Keep them private. Source ZIPs exclude `logs/`, `.env`, dependencies, tests, and generated caches.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | Required | Discord application bot token. |
| `COMMAND_PREFIX` | `!` | 1-10 characters without whitespace. |
| `DM_DELAY_MS` | `1000` | Normal delay between attempts, 1000-60000 milliseconds. Slower commands use their fixed schedule. |
| `DEFAULT_MESSAGE` | Empty | Used when a message argument is omitted. Leave empty to require a message. |
| `PORT` | `3000` | HTTP health server port, 1-65535. |
| `HOST` | `0.0.0.0` | HTTP bind address. |

`GET /health` and `GET /` return HTTP 200 when Discord is ready and 503 otherwise. Other paths return 404. Invalid bot credentials stop the current campaign.

## Development verification

Run `npm test` from the full development checkout. The minimal source ZIP excludes the test files.
