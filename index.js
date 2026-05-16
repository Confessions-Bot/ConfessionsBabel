import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  WebhookClient,
  EmbedBuilder
} from 'discord.js';

import { translate } from 'google-translate-api-x';

// =========================
// CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// DEBUG
// =========================

const DEBUG = true;

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m'
};

function color(text, c) {
  return `${COLORS[c]}${text}${COLORS.reset}`;
}

function debugBlock(lines) {
  if (!DEBUG) return;

  console.log(color('[DEBUG] --- Message Logging ---', 'cyan'));
  for (const line of lines) {
    console.log(color(`[DEBUG] ${line}`, 'gray'));
  }
  console.log(color('[DEBUG] ----------------------', 'cyan'));
}

// =========================
// CONFIG
// =========================

const allowedCategories = new Set([
  '1074642463588888598',
  '1313432842511978527'
]);

const staffRoleIds = [
  '1248090677711994901',
  '1248118632618266655',
  '1248097695764054147',
  '808381326100398120'
];

// =========================
// VALID LANGS
// =========================

const VALID_LANGS = new Set([
  'ar','bg','zh','hr','cs','da','nl','en','fi','fr','de','el','he','hi',
  'hu','id','it','ja','ko','no','pl','pt','ro','ru','sk','es','sv','th',
  'tr','uk','vi','tl','lt'
]);

// =========================
// STATE
// =========================

const oldChannels = new Set();
const activeTickets = new Set();

const ticketState = new Map();

// =========================
// STAFF CHECK
// =========================

function isStaff(member) {
  if (!member) return false;
  return member.roles.cache.some(r => staffRoleIds.includes(r.id));
}

// =========================
// TEXT EXTRACTION
// =========================

function extractMessageText(message) {
  let text = message.content || '';

  for (const embed of message.embeds || []) {
    if (embed.title) text += '\n' + embed.title;
    if (embed.description) text += '\n' + embed.description;

    for (const f of embed.fields || []) {
      text += `\n${f.name}: ${f.value}`;
    }
  }

  return text.trim();
}

// =========================
// LANGUAGE DETECTION
// =========================

const languageAliases = {
  ar: ['arabic', 'العربية'],
  bg: ['bulgarian', 'български'],
  zh: ['chinese', '中文', 'mandarin'],
  hr: ['croatian', 'hrvatski'],
  cs: ['czech', 'čeština'],
  da: ['danish', 'dansk'],
  nl: ['dutch', 'nederlands'],
  en: ['english'],
  fi: ['finnish', 'suomi'],
  fr: ['french', 'français'],
  de: ['german', 'deutsch'],
  el: ['greek', 'ελληνικά'],
  he: ['hebrew', 'עברית'],
  hi: ['hindi', 'हिन्दी'],
  hu: ['hungarian', 'magyar'],
  id: ['indonesian', 'bahasa indonesia'],
  it: ['italian', 'italiano'],
  ja: ['japanese', '日本語'],
  ko: ['korean', '한국어'],
  lt: ['lithuanian', 'lietuvių'],
  no: ['norwegian', 'norsk'],
  pl: ['polish', 'polski'],
  pt: ['portuguese', 'português'],
  ro: ['romanian', 'română'],
  ru: ['russian', 'русский'],
  sk: ['slovak', 'slovenčina'],
  es: ['spanish', 'español'],
  sv: ['swedish', 'svenska'],
  th: ['thai', 'ไทย'],
  tr: ['turkish', 'türkçe'],
  uk: ['ukrainian', 'українська'],
  vi: ['vietnamese', 'tiếng việt'],
  tl: ['tagalog', 'filipino']
};

function extractPreferredLanguage(text) {
  if (!text) return null;

  const lower = text.toLowerCase();

  for (const [code, aliases] of Object.entries(languageAliases)) {
    if (aliases.some(a => lower.includes(a))) {
      return code;
    }
  }

  return null;
}

// =========================
// SAFE TRANSLATION
// =========================

async function translateText(text, to) {
  if (!to || !VALID_LANGS.has(to)) {
    console.error('[TRANSLATE BLOCKED] invalid target:', to);
    return text;
  }

  const res = await translate(text, { to });
  return res.text;
}

// =========================
// WEBHOOK
// =========================

async function getWebhook(channel) {
  const hooks = await channel.fetchWebhooks();

  let hook = hooks.find(h => h.name === 'Confessions Babel');

  if (!hook) {
    hook = await channel.createWebhook({ name: 'Confessions Babel' });
  }

  return new WebhookClient({
    id: hook.id,
    token: hook.token
  });
}

// =========================
// INIT
// =========================

async function initializeTicket(channel) {
  if (ticketState.has(channel.id)) return ticketState.get(channel.id);

  const messages = await channel.messages.fetch({ limit: 25 });

  let combined = '';

  for (const msg of messages.values()) {
    combined += '\n' + (msg.content || '');

    for (const e of msg.embeds || []) {
      combined += '\n' + (e.description || '');

      for (const f of e.fields || []) {
        combined += `\n${f.name}: ${f.value}`;
      }
    }
  }

  const lang = extractPreferredLanguage(combined);
  const safeLang = VALID_LANGS.has(lang) ? lang : null;

  const state = (!safeLang || safeLang === 'en')
    ? { ignore: true, reason: safeLang === 'en' ? 'english' : 'invalid', disabled: false }
    : { ignore: false, sourceLang: safeLang, disabled: false };

  ticketState.set(channel.id, state);
  return state;
}

// =========================
// READY
// =========================

client.once('ready', async () => {
  console.log(`[READY] Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await guild.channels.fetch();

    for (const channel of guild.channels.cache.values()) {
      if (!channel.parentId) continue;

      if (allowedCategories.has(channel.parentId)) {
        oldChannels.add(channel.id);
      }
    }
  }

  console.log(`[BOOT] Cached old tickets: ${oldChannels.size}`);
});

// =========================
// MESSAGE HANDLER
// =========================

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.webhookId) return;

    if (!message.channel.parentId || !allowedCategories.has(message.channel.parentId)) {
      return;
    }

    if (oldChannels.has(message.channel.id)) return;

    const rawText = extractMessageText(message);
    if (!rawText) return;

    // =========================
    // COMMANDS
    // =========================

    const content = message.content?.toLowerCase();

    if (content === '!disable' || content === '!enable' || content === '!status') {
      let state = ticketState.get(message.channel.id);

      if (!state) {
        state = await initializeTicket(message.channel);
      }

      if (content === '!disable') {
        state.disabled = true;
        ticketState.set(message.channel.id, state);

        return message.reply({
          content: '❌ Translations disabled for this ticket.',
          allowedMentions: { repliedUser: true }
        });
      }

      if (content === '!enable') {
        state.disabled = false;
        ticketState.set(message.channel.id, state);

        return message.reply({
          content: '✅ Translations enabled for this ticket.',
          allowedMentions: { repliedUser: true }
        });
      }

      if (content === '!status') {
        return message.reply({
          content:
            `📊 **Ticket Status**\n` +
            `Translations: ${state.disabled ? '❌ Disabled' : '✅ Enabled'}\n` +
            `Language: ${state.sourceLang ? state.sourceLang.toUpperCase() : 'Unknown'}`,
          allowedMentions: { repliedUser: true }
        });
      }
    }

    let state = ticketState.get(message.channel.id);

    if (!activeTickets.has(message.channel.id)) {
      activeTickets.add(message.channel.id);
      state = await initializeTicket(message.channel);

      if (state.ignore) return;
    }

    if (!state || state.ignore) return;
    if (state.disabled) return;

    const isStaffUser = isStaff(message.member);

    const webhook = await getWebhook(message.channel);

    const detectedLang = extractPreferredLanguage(rawText) || state.sourceLang;

    const translated = isStaffUser
      ? await translateText(rawText, state.sourceLang)
      : await translateText(rawText, 'en');

    await message.delete().catch(() => {});

    debugBlock([
      `Channel: ${message.channel.id}`,
      `Author: ${message.author.tag}`,
      `Content: ${rawText}`,
      `Lang: ${state.sourceLang}`,
      `Translated: ${translated}`
    ]);

    const embed = new EmbedBuilder()
      .setColor(isStaffUser ? 0x5865F2 : 0x57F287)
      .addFields(
        {
          name: 'Original Message',
          value: rawText.slice(0, 1024) || '*Empty*'
        },
        {
          name: 'Translated Message',
          value: translated.slice(0, 1024) || '*Empty*'
        }
      )
      .setFooter({
        text: isStaffUser
          ? `[Staff] Translated into ${state.sourceLang?.toUpperCase()}`
          : `[User] Translated into EN`
      })
      .setTimestamp();

    return webhook.send({
      username: `${message.member.displayName} (Translated)`,
      avatarURL: message.author.displayAvatarURL(),
      embeds: [embed]
    });

  } catch (err) {
    console.error('[ERROR]', err);
  }
});

// =========================
// LOGIN
// =========================

client.login(process.env.DISCORD_TOKEN);