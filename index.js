require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

function splitIds(raw) {
  return (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readStickyMinutes(raw) {
  const num = Number(raw);

  if (!Number.isFinite(num) || num <= 0) {
    return 10;
  }

  return num;
}

function readMinutes(raw, fallback) {
  const num = Number(raw);

  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }

  return num;
}

function readHour(raw, fallback) {
  const num = Number(raw);

  if (!Number.isInteger(num) || num < 0 || num > 23) {
    return fallback;
  }

  return num;
}

function readMinute(raw, fallback) {
  const num = Number(raw);

  if (!Number.isInteger(num) || num < 0 || num > 59) {
    return fallback;
  }

  return num;
}

function readMessage(raw) {
  return (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n');
}

function readGradeRoleIds(env) {
  return {
    freshman: env.GRADE_ROLE_FRESHMAN_ID || '',
    sophomore: env.GRADE_ROLE_SOPHOMORE_ID || '',
    junior: env.GRADE_ROLE_JUNIOR_ID || '',
    senior: env.GRADE_ROLE_SENIOR_ID || '',
    graduate: env.GRADE_ROLE_GRADUATE_ID || '',
  };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
client.botConfig = {
  guildId: process.env.GUILD_ID,
  submitChannelIds: splitIds(process.env.VENT_COMMAND_CHANNEL_IDS || process.env.SUBMIT_CHANNEL_IDS),
  modQueueChannelId: process.env.VENT_REVIEW_CHANNEL_ID || process.env.MOD_QUEUE_CHANNEL_ID,
  forumChannelId: process.env.VENT_FORUM_CHANNEL_ID || process.env.FORUM_CHANNEL_ID,
  stickyChannelIds: splitIds(process.env.STICKY_CHANNEL_IDS || process.env.STICKY_CHANNEL_ID),
  stickyMessage: readMessage(process.env.STICKY_MESSAGE),
  stickyIntervalMs: readStickyMinutes(process.env.STICKY_INTERVAL_MINUTES) * 60 * 1000,
  modRoleId: process.env.MODROLE || '',
  newsletterChannelId: process.env.NEWSLETTER_CHANNEL_ID || '',
  newsletterPingRoleId: process.env.NEWSLETTER_PING_ROLE_ID || '',
  newsletterSourceUrl: process.env.NEWSLETTER_SOURCE_URL || 'https://www.ytech.edu/news',
  newsletterTitlePrefix: process.env.NEWSLETTER_TITLE_PREFIX || 'Spartan Review',
  newsletterPollMs: readMinutes(process.env.NEWSLETTER_POLL_MINUTES, 30) * 60 * 1000,
  qotdChannelId: process.env.QOTD_CHANNEL_ID || '',
  qotdPingRoleId: process.env.QOTD_PING_ROLE_ID || '',
  qotdHour: readHour(process.env.QOTD_HOUR_ET, 18),
  qotdMinute: readMinute(process.env.QOTD_MINUTE_ET, 0),
  qotdTimezone: process.env.QOTD_TIMEZONE || 'America/New_York',
  qotdApiUrl: process.env.QOTD_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
  qotdApiKey: process.env.QOTD_API_KEY || process.env.OPENROUTER_API_KEY || '',
  qotdModel: process.env.QOTD_MODEL || 'openrouter/free',
  qotdSubmitRoleId: process.env.QOTD_SUBMIT_ROLE_ID || process.env.MODROLE || '',
  gradeRoleIds: readGradeRoleIds(process.env),
  supportRoleId: process.env.SUPPORT_ROLE_ID || process.env.TOSS_SUPPORT_ROLE_ID || '',
  tossRollId: process.env.TOSS_ROLL || '',
  tossModRoleId: process.env.TOSS_MOD_ROLE_ID || process.env.MODROLE || '',
};

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
    continue;
  }

  client.on(event.name, (...args) => event.execute(...args));
}

if (!process.env.DISCORD_TOKEN) {
  console.error('missing DISCORD_TOKEN in .env');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
