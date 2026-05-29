# true anon bot

small discord bot for mostly anonymous vents, mod review, and forum threads

## setup

1. open a terminal in this project folder and install deps
   ```bash
   npm install
   ```
2. copy `.env.example` to `.env` and fill it out
3. deploy slash commands
   ```bash
   npm run deploy
   ```
4. start the bot
   ```bash
   npm start
   ```

## env

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
VENT_COMMAND_CHANNEL_IDS=channel_id_one,channel_id_two
VENT_REVIEW_CHANNEL_ID=private_mod_channel_id
VENT_FORUM_CHANNEL_ID=forum_channel_id
MODROLE=moderator_role_id
SUPPORT_ROLE_ID=shared_support_role_id
TOSS_ROLL=restricted_role_id_for_tossed_members
TOSS_MOD_ROLE_ID=
STICKY_CHANNEL_IDS=channel_id_for_sticky_message,another_channel_id
STICKY_MESSAGE="be respectful.
no doxxing.
mods review vents before posting."
STICKY_INTERVAL_MINUTES=10
NEWSLETTER_CHANNEL_ID=channel_id_for_spartan_review_posts
NEWSLETTER_PING_ROLE_ID=role_id_to_ping_when_a_newsletter_posts
NEWSLETTER_SOURCE_URL=https://www.ytech.edu/news
NEWSLETTER_TITLE_PREFIX=Spartan Review
NEWSLETTER_POLL_MINUTES=30
QOTD_CHANNEL_ID=channel_id_for_daily_qotd
QOTD_PING_ROLE_ID=role_id_to_ping_for_qotd
QOTD_HOUR_ET=18
QOTD_MINUTE_ET=0
QOTD_TIMEZONE=America/New_York
OPENROUTER_API_KEY=your_openrouter_api_key
QOTD_API_KEY=
QOTD_API_URL=https://openrouter.ai/api/v1/chat/completions
QOTD_MODEL=openrouter/free
QOTD_SUBMIT_ROLE_ID=role_id_allowed_to_queue_qotd
GRADE_ROLE_FRESHMAN_ID=role_id_for_freshman
GRADE_ROLE_SOPHOMORE_ID=role_id_for_sophomore
GRADE_ROLE_JUNIOR_ID=role_id_for_junior
GRADE_ROLE_SENIOR_ID=role_id_for_senior
GRADE_ROLE_GRADUATE_ID=role_id_for_graduate
```

- `VENT_COMMAND_CHANNEL_IDS`: comma-separated channel ids where `/submit` is allowed
- `VENT_REVIEW_CHANNEL_ID`: private mod channel where approve/reject messages go
- `VENT_FORUM_CHANNEL_ID`: forum channel where approved vents get posted
- `MODROLE`: optional role id that gates approve, reject, request-more-info, resolve, and close actions
- `SUPPORT_ROLE_ID`: shared support/staff role; toss rooms ping this role and grant it access
- `TOSS_ROLL`: restricted toss role the bot adds during a toss; configure your normal channels so this role is denied access
- `TOSS_MOD_ROLE_ID`: optional role id that gates `/toss`, `/untoss`, and the toss room control panel; falls back to `MODROLE`, then `Manage Channels`
- `STICKY_CHANNEL_IDS`: comma-separated channel ids where the bot keeps reposting the sticky
- `STICKY_MESSAGE`: sticky text; you can write it as a quoted multiline value, and `\n` still works too
- `STICKY_INTERVAL_MINUTES`: how often the bot deletes the old sticky and posts a new one
- `NEWSLETTER_CHANNEL_ID`: channel where new York Tech newsletter posts should be sent
- `NEWSLETTER_PING_ROLE_ID`: optional role id to mention when a new newsletter is posted
- `NEWSLETTER_SOURCE_URL`: page to poll for newsletter articles; defaults to `https://www.ytech.edu/news`
- `NEWSLETTER_TITLE_PREFIX`: title prefix the watcher looks for; defaults to `Spartan Review`
- `NEWSLETTER_POLL_MINUTES`: how often to check for a new newsletter issue
- `QOTD_CHANNEL_ID`: channel where the daily question should be posted
- `QOTD_PING_ROLE_ID`: optional role id to mention with the daily question
- `QOTD_HOUR_ET`: target hour in Eastern Time, using 24-hour time; `18` means 6:00 PM
- `QOTD_MINUTE_ET`: target minute in Eastern Time
- `QOTD_TIMEZONE`: defaults to `America/New_York`
- `OPENROUTER_API_KEY`: OpenRouter API key; the QOTD feature will use this automatically if `QOTD_API_KEY` is blank
- `QOTD_API_KEY`: optional dedicated API key just for QOTD requests
- `QOTD_API_URL`: defaults to OpenRouter chat completions at `https://openrouter.ai/api/v1/chat/completions`
- `QOTD_MODEL`: defaults to `openrouter/free`
- `QOTD_SUBMIT_ROLE_ID`: optional role id that can use `/qotd submit`; falls back to `MODROLE`, then `Manage Messages`
- `GRADE_ROLE_FRESHMAN_ID` through `GRADE_ROLE_GRADUATE_ID`: the five class-role ids used by `/promotegrades`

## what it does

- `/submit` opens a modal for an anonymous vent
- `/submit` can also be used in bot DMs
- `/reply` explains how anonymous follow-ups work
- `/toss` opens a private support room for one member, pings the shared support role, and temporarily strips the member's normal server roles until staff close the room
- `/toss` also applies the configured toss role so the member can be blocked from the rest of the server while still seeing the toss room
- `/untoss` restores the member's saved roles and closes out the private toss room
- the bot asks for DM confirmation before it sends anything
- the mod review message has approve and reject buttons
- rejection can include an optional typed-out moderator reason that gets DMd back
- approval creates a forum post and keeps the sender hidden from the public thread
- after approval, the original poster gets a DM control panel for anonymous follow-ups and thread actions
- the user control panel can post follow-ups and let the original poster close, resolve, or delete their own thread
- moderators can request more information and the bot relays the answer back in DMs
- mods can close or resolve a thread with buttons
- toss rooms open with a built-in control panel so staff can close the room or temporarily lock/unlock the member inside it
- dead threads get auto-locked after 8 hours with no new messages
- optional sticky messages can be reposted on a timer in one channel
- optional York Tech newsletter watching can post new Spartan Review issues as embeds in a channel
- optional QOTD queue can post once a day on an Eastern Time schedule
- `/qotd submit` lets the configured role add a question to the daily QOTD queue
- `/promotegrades` lets the server owner roll class roles forward by one year and posts an `@everyone` graduation embed

## newsletter watcher

- this polls the York Tech news page and looks for the newest article whose title starts with `Spartan Review`
- when it finds a new issue, it sends a polished embed with buttons to open the article
- if `NEWSLETTER_PING_ROLE_ID` is set, that role gets pinged with the post
- on the first startup with newsletter watching enabled, the bot records the current latest issue and waits for the next new one instead of reposting the existing article

## qotd

- `/qotd submit question:<text>` adds a question to the daily queue
- queued questions are sent first, one per day, in submission order
- if the queue is empty and an API key is configured, the bot falls back to AI generation through OpenRouter's `openrouter/free` router
- by default it checks every minute and posts once per day at `6:00 PM` Eastern
- if the bot is offline at exactly 6:00 PM, it will post later the same evening when the bot comes back up
- if `QOTD_PING_ROLE_ID` is set, that role gets pinged with the question
- each QOTD post immediately opens its own thread for replies
- it keeps a longer recent-question history and rejects obvious cousin-questions, not just exact repeats
- if the API request fails, it waits 5 minutes and tries again
- if you want a different model later, set `QOTD_MODEL` to another OpenRouter model id or a `:free` variant

## how anonymous it really is

- this is mostly anonymous in normal server use, not perfect anonymity
- the public forum thread does not show who sent the vent
- moderators using the bot do not get shown the sender identity in the review flow, thread tools, or follow-up relay
- the bot itself still has to know which discord account sent the vent so it can DM confirmations, rejection reasons, and follow-up questions
- this is not anonymity from discord, and it is not anonymity from anyone with direct access to the bot process or host
- those limits are not this bot being weird, they are basic limits of how discord and discord bots fundamentally work
- to keep DM follow-ups and moderator relays working reliably, the bot stores the active sender-to-thread routing on disk while a vent is open
- once a vent is rejected, closed, resolved, or auto-closed, that active routing is removed

## thread actions

- `Close Thread`: shuts the thread down without saying the issue was solved
- `Resolved`: marks it as handled and then shuts the thread down

## bot permissions

the bot should be able to:

- use slash commands
- send messages and embeds
- send DMs
- create public threads / forum posts
- manage threads
- read the mod queue channel

if `MODROLE` is set, only that role can use the sensitive mod controls

if `MODROLE` is not set, those controls fall back to `Manage Threads`

for toss rooms, the bot also needs:

- `Manage Channels`
- `Manage Roles`
- its highest bot role placed above every role that might need to be removed from a tossed member
- a restricted role configured in `TOSS_ROLL`, with your normal channels denied to that role

for `/promotegrades`, the bot also needs:

- `Manage Roles`
- the `Server Members Intent` enabled in the Discord developer portal
- its highest bot role placed above all five configured class roles
