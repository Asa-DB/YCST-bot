const {
  EmbedBuilder,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
} = require('discord.js');
const runtimeStore = require('../utils/runtimeStore');
const { makeSubmissionId } = require('../utils/idGenerator');
const {
  errEmbed,
  okEmbed,
  warnBox,
} = require('../utils/responseEmbeds');

const CHECK_EVERY_MS = 60 * 1000;
const API_TIMEOUT_MS = 30_000;
const RECENT_QOTD_LIMIT = 30;
const MAX_QUEUED_QOTD = 100;
const MAX_SUBMITTED_QOTD_LENGTH = 180;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_QOTD_ATTEMPTS = 3;

const BORING_QOTD_WORDS = new Set([
  'about',
  'actually',
  'after',
  'again',
  'almost',
  'also',
  'always',
  'anyone',
  'anything',
  'because',
  'been',
  'being',
  'could',
  'day',
  'does',
  'even',
  'ever',
  'everyone',
  'feel',
  'from',
  'good',
  'have',
  'into',
  'just',
  'kind',
  'like',
  'little',
  'make',
  'most',
  'much',
  'need',
  'over',
  'really',
  'some',
  'someone',
  'something',
  'still',
  'that',
  'their',
  'them',
  'then',
  'there',
  'thing',
  'think',
  'this',
  'very',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
  'youre',
]);

const QOTD_THEME_GROUPS = [
  ['kid', 'kids', 'child', 'childhood', 'younger', 'teen', 'school', 'teacher', 'parent'],
  ['habit', 'routine', 'ritual', 'daily', 'pandemic', 'picked up'],
  ['food', 'snack', 'meal', 'drink', 'restaurant', 'cook', 'kitchen'],
  ['movie', 'show', 'song', 'album', 'game', 'book', 'episode', 'character'],
  ['job', 'work', 'career', 'coworker', 'boss', 'experience'],
  ['hill', 'opinion', 'defend', 'overrated', 'underrated', 'hot take'],
  ['hypothetical', 'superpower', 'time travel', 'if you could', 'would you rather'],
  ['room', 'desk', 'closet', 'object', 'item', 'own'],
  ['skill', 'talent', 'weirdly good', 'bad at', 'learn'],
  ['memory', 'remember', 'nostalgia', 'past', 'old'],
  ['petty', 'annoying', 'minor', 'complaint', 'small'],
];

const QOTD_FLAVORS = [
  {
    name: 'tiny nonsense',
    direction: 'Ask about a small, stupidly specific preference or harmless daily-life grievance.',
    examples: [
      'What tiny inconvenience makes you act like the universe personally targeted you?',
      'What normal thing do you have an unnecessarily strong opinion about?',
    ],
  },
  {
    name: 'odd little lore',
    direction: 'Ask for a short personal story, weird family rule, or oddly specific life detail.',
    examples: [
      'What is the strangest rule your house had growing up?',
      'What is a tiny piece of personal lore that sounds fake but is real?',
    ],
  },
  {
    name: 'taste crimes',
    direction: 'Ask about taste, food, media, objects, or aesthetics without making it a favorite-color question.',
    examples: [
      'What snack pairing would get you judged even though it absolutely works?',
      'What ugly object do you secretly respect?',
    ],
  },
  {
    name: 'bad plans',
    direction: 'Ask a mildly chaotic hypothetical that people can answer in one message.',
    examples: [
      'What terrible business would you start if profit did not matter?',
      'What would your first law be if you were mayor for one extremely annoying day?',
    ],
  },
  {
    name: 'quiet confessions',
    direction: 'Ask for a low-stakes confession, petty belief, or thing people rarely admit out loud.',
    examples: [
      'What is something harmless you pretend to understand but absolutely do not?',
      'What small task makes you feel like you deserve a parade?',
    ],
  },
  {
    name: 'social weirdness',
    direction: 'Ask about awkward social instincts, group-chat behavior, or tiny public embarrassments.',
    examples: [
      'What is your most irrational public-facing anxiety?',
      'What group-chat message makes you immediately suspicious?',
    ],
  },
];

const savedStuff = runtimeStore.readState();
const qotdState = {
  lastPostedDay: savedStuff.qotdState?.lastPostedDay || '',
  lastPostedAt: savedStuff.qotdState?.lastPostedAt || '',
  nextTryAt: savedStuff.qotdState?.nextTryAt || '',
  queuedQuestions: Array.isArray(savedStuff.qotdState?.queuedQuestions)
    ? cleanQueuedQuestions(savedStuff.qotdState.queuedQuestions)
    : [],
  recentQuestions: Array.isArray(savedStuff.qotdState?.recentQuestions)
    ? cleanStoredQuestions(savedStuff.qotdState.recentQuestions)
    : [],
};

function saveQotdState() {
  runtimeStore.saveQotdState(qotdState);
}

function getEtTimeBits(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map = {};

  for (const part of parts) {
    if (part.type === 'literal') {
      continue;
    }

    map[part.type] = part.value;
  }

  return {
    dayKey: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday || '',
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function shouldPostNow(config, nowBits) {
  if (nowBits.dayKey === qotdState.lastPostedDay) {
    return false;
  }

  if (nowBits.hour > config.qotdHour) {
    return true;
  }

  return nowBits.hour === config.qotdHour && nowBits.minute >= config.qotdMinute;
}

function cleanupQuestion(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text.trim();

  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');
  cleaned = cleaned.replace(/^\s*(question of the day|qotd)\s*[:\-]\s*/i, '');
  cleaned = cleaned.replace(/\n+/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned && !/[?؟]$/.test(cleaned)) {
    cleaned = `${cleaned.replace(/[.!]+$/g, '')}?`;
  }

  return cleaned;
}

function normalizeQuestion(text) {
  return cleanupQuestion(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanStoredQuestions(questions) {
  return questions
    .map((item) => cleanupQuestion(item))
    .filter((item) => item && !hasPromptLeak(item))
    .slice(0, RECENT_QOTD_LIMIT);
}

function makeQotdQueueId() {
  return `QOTD-${makeSubmissionId()}`;
}

function cleanQueuedQuestions(items) {
  return items
    .map((item) => {
      const oldItem = item && typeof item === 'object' && !Array.isArray(item)
        ? item
        : { question: item };
      const question = cleanupQuestion(oldItem.question || '');

      if (!question || hasPromptLeak(question)) {
        return null;
      }

      return {
        id: typeof oldItem.id === 'string' && oldItem.id ? oldItem.id : makeQotdQueueId(),
        question,
        submittedBy: isSnowflake(oldItem.submittedBy) ? oldItem.submittedBy : '',
        submittedAt: typeof oldItem.submittedAt === 'string' && oldItem.submittedAt
          ? oldItem.submittedAt
          : new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_QUEUED_QOTD);
}

function getQuestionTokens(question) {
  return normalizeQuestion(question)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !BORING_QOTD_WORDS.has(word))
    .map((word) => word.replace(/ies$/, 'y').replace(/s$/, ''));
}

function getSimilarityScore(left, right) {
  const leftTokens = new Set(getQuestionTokens(left));
  const rightTokens = new Set(getQuestionTokens(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function getThemeGroups(question) {
  const normalized = normalizeQuestion(question);

  return QOTD_THEME_GROUPS
    .filter((terms) => terms.some((term) => normalized.includes(term)))
    .map((terms) => terms[0]);
}

function isSimilarQuestion(question, previousQuestion) {
  const normalized = normalizeQuestion(question);
  const previousNormalized = normalizeQuestion(previousQuestion);

  if (!normalized || !previousNormalized) {
    return false;
  }

  if (normalized === previousNormalized) {
    return true;
  }

  if (getSimilarityScore(question, previousQuestion) >= 0.55) {
    return true;
  }

  const themes = getThemeGroups(question);
  const previousThemes = getThemeGroups(previousQuestion);

  return themes.length > 0 && themes.some((theme) => previousThemes.includes(theme));
}

function isRecentQuestion(question) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return false;
  }

  return qotdState.recentQuestions.some((item) => isSimilarQuestion(question, item));
}

function hasPromptLeak(question) {
  const lowered = question.toLowerCase();
  const markers = [
    'write one question of the day',
    'return only',
    'examples:',
    'recent questions to avoid',
    'under 20 words',
    'therapy-speak',
    'icebreakers',
    'conversational',
    'fake-deep',
    'brand prompt',
    'one sentence',
    'timezone context',
    'generate four',
    'structured data',
    'corporate sparkle',
    'therapy worksheet',
    'calendar filler',
    'today\'s lane',
  ];

  return markers.some((marker) => lowered.includes(marker));
}

function isValidQuestion(question) {
  if (!question) {
    return false;
  }

  const wordCount = question.split(/\s+/).filter(Boolean).length;
  const questionMarkCount = (question.match(/\?/g) || []).length;

  if (question.length < 18 || question.length > 140) {
    return false;
  }

  if (wordCount < 5 || wordCount > 24) {
    return false;
  }

  if (!question.endsWith('?') || questionMarkCount !== 1) {
    return false;
  }

  if (/[.!]\s+\S/.test(question)) {
    return false;
  }

  if (hasPromptLeak(question)) {
    return false;
  }

  if (isRecentQuestion(question)) {
    return false;
  }

  return true;
}

function isSnowflake(value) {
  return typeof value === 'string' && /^\d{16,20}$/.test(value);
}

function hasRoleSomewhere(memberLike, roleId) {
  if (!memberLike?.roles || !roleId) {
    return false;
  }

  if (Array.isArray(memberLike.roles)) {
    return memberLike.roles.includes(roleId);
  }

  return memberLike.roles.cache?.has(roleId) || false;
}

function canSubmitQotd(interaction) {
  const roleId = interaction.client.botConfig.qotdSubmitRoleId;

  if (roleId) {
    return hasRoleSomewhere(interaction.member, roleId);
  }

  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || false;
}

function qotdSubmitDeniedText(interaction) {
  if (interaction.client.botConfig.qotdSubmitRoleId) {
    return 'You need the configured QOTD submit role for that.';
  }

  return 'You need `Manage Messages` for that.';
}

function isQueuedQuestion(question) {
  const normalized = normalizeQuestion(question);

  if (!normalized) {
    return false;
  }

  return qotdState.queuedQuestions.some((item) => normalizeQuestion(item.question) === normalized);
}

function validateSubmittedQuestion(rawQuestion) {
  const question = cleanupQuestion(rawQuestion);

  if (!question) {
    return { error: 'Write the question you want to add to the queue.' };
  }

  if (question.length < 10) {
    return { error: 'That question is too short to use as a QOTD.' };
  }

  if (question.length > MAX_SUBMITTED_QOTD_LENGTH) {
    return { error: `Keep QOTD submissions under ${MAX_SUBMITTED_QOTD_LENGTH} characters.` };
  }

  if ((question.match(/\?/g) || []).length !== 1 || !question.endsWith('?')) {
    return { error: 'Use one clear question, with one question mark at the end.' };
  }

  if (/[.!]\s+\S/.test(question)) {
    return { error: 'Keep it to one sentence.' };
  }

  if (hasPromptLeak(question)) {
    return { error: 'That looks like prompt text instead of a QOTD.' };
  }

  if (isRecentQuestion(question)) {
    return { error: 'That is too close to a recent QOTD. Try a different angle.' };
  }

  if (isQueuedQuestion(question)) {
    return { error: 'That question is already in the QOTD queue.' };
  }

  return { question };
}

function getNextQueuedQuestion() {
  return qotdState.queuedQuestions[0] || null;
}

function removeQueuedQuestion(queueId) {
  if (!queueId) {
    return;
  }

  qotdState.queuedQuestions = qotdState.queuedQuestions.filter((item) => item.id !== queueId);
}

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  if (typeof text === 'object' && !Array.isArray(text)) {
    return text;
  }

  if (typeof text !== 'string') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function hashText(text) {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function getQotdFlavor(timeZone) {
  const nowBits = getEtTimeBits(timeZone);
  return QOTD_FLAVORS[hashText(nowBits.dayKey) % QOTD_FLAVORS.length];
}

function makePrompt(config) {
  const recent = qotdState.recentQuestions.length
    ? qotdState.recentQuestions.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : 'None yet';
  const vibeLine = getQuietThemeHint(config.qotdTimezone);
  const flavor = getQotdFlavor(config.qotdTimezone);
  const flavorExamples = flavor.examples.map((item) => `- ${item}`).join('\n');

  return [
    'Generate four distinct question-of-the-day candidates for a Discord server.',
    'Write like a real person in chat: casual, a little silly, mildly unpolished, and specific.',
    'No corporate sparkle. No therapy worksheet energy. No "what are you grateful for" calendar filler.',
    `Today's lane: ${flavor.name}. ${flavor.direction}`,
    'Do not reuse the same angle, topic family, sentence frame, or "what is something..." rhythm from recent questions.',
    'Make each candidate feel like it came from a different brain with a different minor problem.',
    'Each question must be one sentence, end with a question mark, and stay under 20 words.',
    'Do not repeat or closely echo any recent questions.',
    'Order the candidates from strongest to weakest.',
    '',
    'Style examples for today, not templates to copy:',
    flavorExamples,
    '',
    'Recent questions to avoid:',
    recent,
    '',
    vibeLine,
    `Timezone context: ${config.qotdTimezone}.`,
  ].join('\n');
}

function getQuietThemeHint(timeZone) {
  const today = getEtTimeBits(timeZone).weekday;

  if (today === 'Monday') {
    return 'Lean a little more reflective and reset-oriented, but keep it natural.';
  }

  if (today === 'Tuesday') {
    return 'Slightly favor personal perspective and thoughtful opinions.';
  }

  if (today === 'Wednesday') {
    return 'A mild weird-hypothetical angle is good if it still feels conversation-worthy.';
  }

  if (today === 'Thursday') {
    return 'Lean a bit more honest, observant, or quietly revealing.';
  }

  if (today === 'Friday') {
    return 'Let it feel looser, playful, or socially fun without getting shallow.';
  }

  if (today === 'Saturday') {
    return 'A more offbeat, curious, or imaginative question works well.';
  }

  if (today === 'Sunday') {
    return 'Lean slightly calmer, reflective, or future-looking.';
  }

  return 'Keep the tone balanced and natural.';
}

async function askForQotd(config) {
  for (let attempt = 0; attempt < MAX_QOTD_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(config.qotdApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.qotdApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.qotdModel,
          provider: {
            require_parameters: true,
          },
          messages: [
            {
              role: 'system',
              content: 'You write natural, human-sounding question-of-the-day prompts for online communities. Return structured data only.',
            },
            {
              role: 'user',
              content: makePrompt(config),
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'qotd_candidates',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  candidates: {
                    type: 'array',
                    minItems: 4,
                    maxItems: 4,
                    items: {
                      type: 'object',
                      properties: {
                        question: {
                          type: 'string',
                          description: 'A single natural-sounding question of the day.',
                        },
                      },
                      required: ['question'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['candidates'],
                additionalProperties: false,
              },
            },
          },
          plugins: [{ id: 'response-healing' }],
          temperature: 1.1,
          max_tokens: 220,
          stream: false,
        }),
      });

      if (!response.ok) {
        const problemText = await response.text().catch(() => '');
        throw new Error(`qotd api failed with status ${response.status}${problemText ? `: ${problemText}` : ''}`);
      }

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content || '';
      const parsed = parseJsonObject(rawText);
      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];

      for (const candidate of candidates) {
        const question = cleanupQuestion(candidate?.question || '');

        if (isValidQuestion(question)) {
          return question;
        }
      }

      console.warn(`qotd api returned no valid candidates on attempt ${attempt + 1}`);
      console.warn(rawText);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('qotd api returned no valid question candidates');
}

function shortTime(num) {
  return String(num).padStart(2, '0');
}

function prettyDate(rawIso) {
  if (!rawIso) {
    return '';
  }

  const maybeDate = new Date(rawIso);

  if (Number.isNaN(maybeDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
  }).format(maybeDate);
}

function buildQotdEmbed(question, nowBits) {
  const prettyToday = prettyDate(new Date().toISOString());
  const postedAt = `${shortTime(nowBits.hour)}:${shortTime(nowBits.minute)} ET`;

  const embed = new EmbedBuilder()
    .setColor(0xd1a15d)
    .setTitle('QOTD')
    .setDescription(question);

  const footerText = prettyToday
    ? `${prettyToday} • ${postedAt}`
    : postedAt;

  embed.setFooter({
    text: footerText,
  });

  return embed;
}

function makeThreadName(question, nowBits) {
  const shortQuestion = question.length > 55
    ? `${question.slice(0, 52).trimEnd()}...`
    : question;

  return `qotd ${nowBits.dayKey} - ${shortQuestion}`;
}

function rememberQuestion(question, dayKey, queueId = '') {
  qotdState.lastPostedDay = dayKey;
  qotdState.lastPostedAt = new Date().toISOString();
  qotdState.nextTryAt = '';
  removeQueuedQuestion(queueId);
  qotdState.recentQuestions.unshift(question);

  if (qotdState.recentQuestions.length > RECENT_QOTD_LIMIT) {
    qotdState.recentQuestions = qotdState.recentQuestions.slice(0, RECENT_QOTD_LIMIT);
  }

  saveQotdState();
}

function canTryAgainYet() {
  if (!qotdState.nextTryAt) {
    return true;
  }

  const nextTryDate = new Date(qotdState.nextTryAt);

  if (Number.isNaN(nextTryDate.getTime())) {
    return true;
  }

  return Date.now() >= nextTryDate.getTime();
}

function scheduleRetry() {
  qotdState.nextTryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
  saveQotdState();
}

async function submitQueuedQotd(interaction, rawQuestion) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [warnBox('Wrong Place', 'QOTD submissions can only be queued from inside the server.')],
      ephemeral: true,
    });
    return;
  }

  if (!interaction.client.botConfig.qotdChannelId) {
    await interaction.reply({
      embeds: [errEmbed('Setup Problem', 'Set `QOTD_CHANNEL_ID` before queueing QOTDs.')],
      ephemeral: true,
    });
    return;
  }

  if (!canSubmitQotd(interaction)) {
    await interaction.reply({
      embeds: [warnBox('Nope', qotdSubmitDeniedText(interaction))],
      ephemeral: true,
    });
    return;
  }

  if (qotdState.queuedQuestions.length >= MAX_QUEUED_QOTD) {
    await interaction.reply({
      embeds: [errEmbed('Queue Full', `The QOTD queue already has ${MAX_QUEUED_QOTD} questions.`)],
      ephemeral: true,
    });
    return;
  }

  const result = validateSubmittedQuestion(rawQuestion);

  if (result.error) {
    await interaction.reply({
      embeds: [warnBox('Not Queued', result.error)],
      ephemeral: true,
    });
    return;
  }

  const item = {
    id: makeQotdQueueId(),
    question: result.question,
    submittedBy: interaction.user.id,
    submittedAt: new Date().toISOString(),
  };

  qotdState.queuedQuestions.push(item);
  saveQotdState();

  await interaction.reply({
    embeds: [okEmbed('QOTD Queued', [
      `Added this to the daily queue at position ${qotdState.queuedQuestions.length}.`,
      '',
      item.question,
    ])],
    ephemeral: true,
  });
}

async function sendQotd(client, question, nowBits) {
  const channel = await client.channels.fetch(client.botConfig.qotdChannelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error('qotd channel is missing or not text-based');
  }

  const roleId = isSnowflake(client.botConfig.qotdPingRoleId)
    ? client.botConfig.qotdPingRoleId
    : '';
  const sentMessage = await channel.send({
    content: roleId ? `<@&${roleId}>` : undefined,
    allowedMentions: roleId ? { roles: [roleId] } : undefined,
    embeds: [buildQotdEmbed(question, nowBits)],
  });

  const thread = await sentMessage.startThread({
    name: makeThreadName(question, nowBits),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: 'daily qotd discussion thread',
  });

  await thread.send('Use this thread for answers so the main channel stays readable.');
}

async function triggerQotd(client, overrides = {}) {
  const config = {
    ...client.botConfig,
    ...overrides,
  };

  if (!config.qotdChannelId) {
    throw new Error('missing qotd channel id');
  }

  const nowBits = getEtTimeBits(config.qotdTimezone || 'America/New_York');
  const queuedQuestion = getNextQueuedQuestion();

  if (!queuedQuestion && !config.qotdApiKey) {
    throw new Error('missing qotd api key and no queued qotd');
  }

  const question = queuedQuestion
    ? queuedQuestion.question
    : await askForQotd(config);
  const previousConfig = client.botConfig;

  try {
    client.botConfig = config;
    await sendQotd(client, question, nowBits);
  } finally {
    client.botConfig = previousConfig;
  }

  rememberQuestion(question, nowBits.dayKey, queuedQuestion?.id || '');

  return {
    nowBits,
    question,
  };
}

async function checkQotd(client) {
  const config = client.botConfig;

  if (!config.qotdChannelId) {
    return;
  }

  const nowBits = getEtTimeBits(config.qotdTimezone);

  if (!shouldPostNow(config, nowBits)) {
    return;
  }

  try {
    const hasQueuedQuestion = qotdState.queuedQuestions.length > 0;

    if (!hasQueuedQuestion && !config.qotdApiKey) {
      return;
    }

    if (!hasQueuedQuestion && !canTryAgainYet()) {
      return;
    }

    await triggerQotd(client, {
      qotdTimezone: config.qotdTimezone,
    });
  } catch (error) {
    console.error('qotd post failed, trying again in 5 minutes');
    console.error(error);
    scheduleRetry();
  }
}

function startQotdLoop(client) {
  if (!client.botConfig.qotdChannelId) {
    return;
  }

  setInterval(() => {
    checkQotd(client).catch((error) => {
      console.error('qotd check failed');
      console.error(error);
    });
  }, CHECK_EVERY_MS);
}

module.exports = {
  buildQotdEmbed,
  checkQotd,
  submitQueuedQotd,
  triggerQotd,
  startQotdLoop,
};
