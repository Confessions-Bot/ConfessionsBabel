import 'dotenv/config';

import {
  Client,
  GatewayIntentBits,
  WebhookClient,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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
// CONFIG
// =========================

const allowedCategories = new Set([
  '1074642463588888598',
  '1313432842511978527'
]);
const staffRoleIds = [
  '1263686371051049072',
  '1248118632618266655',
  '1248090677711994901',
  '808381326100398120',
  '1248097695764054147',
];

const LANGUAGE_MAP = {
  ar: "ar",
  arabic: "ar",

  bg: "bg",
  bulgarian: "bg",

  zh: "zh",
  chinese: "zh",
  mandarin: "zh",

  hr: "hr",
  croatian: "hr",

  cs: "cs",
  czech: "cs",

  da: "da",
  danish: "da",

  nl: "nl",
  dutch: "nl",

  en: "en",
  english: "en",

  fi: "fi",
  finnish: "fi",

  fr: "fr",
  french: "fr",

  de: "de",
  german: "de",

  el: "el",
  greek: "el",

  he: "he",
  hebrew: "he",

  hi: "hi",
  hindi: "hi",

  hu: "hu",
  hungarian: "hu",

  id: "id",
  indonesian: "id",

  it: "it",
  italian: "it",

  ja: "ja",
  japanese: "ja",

  ko: "ko",
  korean: "ko",

  no: "no",
  norwegian: "no",

  pl: "pl",
  polish: "pl",

  pt: "pt",
  portuguese: "pt",

  ro: "ro",
  romanian: "ro",

  ru: "ru",
  russian: "ru",

  sk: "sk",
  slovak: "sk",

  es: "es",
  spanish: "es",

  sv: "sv",
  swedish: "sv",

  th: "th",
  thai: "th",

  tr: "tr",
  turkish: "tr",

  uk: "uk",
  ukrainian: "uk",

  vi: "vi",
  vietnamese: "vi",

  tl: "tl",
  filipino: "tl",
  tagalog: "tl",

  lt: "lt",
  lithuanian: "lt"
};

const VALID_LANGS = new Set(Object.values(LANGUAGE_MAP));

// =========================
// STATE
// =========================

const ticketState = new Map();
const ignoredTickets = new Set();

const botReadyAt = Date.now();

// =========================
// HELPERS
// =========================

function isStaff(member) {
  return member?.roles?.cache?.some(r => staffRoleIds.includes(r.id));
}

async function translateText(text, to) {
  if (!to || !VALID_LANGS.has(to)) return { text, detected: 'auto' };

  const res = await translate(text, { to });

  return {
    text: res.text,
    detected: res.from?.language?.iso || 'auto'
  };
}

async function getWebhook(channel) {
  const hooks = await channel.fetchWebhooks();
  let hook = hooks.find(h => h.name === 'Confessions Babel');

  if (!hook) {
    hook = await channel.createWebhook({ name: 'Confessions Babel' });
  }

  return new WebhookClient({ id: hook.id, token: hook.token });
}

// =========================
// EXTRACTORS
// =========================

function extractLanguage(messages) {
  for (const msg of messages.values()) {
    for (const embed of msg.embeds || []) {
      for (const field of embed.fields || []) {
        if (field.name?.toLowerCase().includes('preferred support language')) {
          const val = field.value?.toLowerCase() || '';

          if (val.includes('french')) return 'fr';
          if (val.includes('german')) return 'de';
          if (val.includes('spanish')) return 'es';
          if (val.includes('japanese')) return 'ja';
          if (val.includes('korean')) return 'ko';
          if (val.includes('english')) return 'en';
        }
      }
    }
  }
  return 'en';
}

// 🔥 RESTORED: ticket question extraction
function extractQuestion(messages) {
  for (const msg of messages.values()) {
    for (const embed of msg.embeds || []) {
      for (const field of embed.fields || []) {
        if (field.name?.toLowerCase().includes('what is your question?')) {
          return field.value;
        }
      }
    }
  }
  return null;
}

// =========================
// INIT TICKET
// =========================

async function initTicket(channel) {
  if (ticketState.has(channel.id)) return ticketState.get(channel.id);

  const messages = await channel.messages.fetch({ limit: 20 });

  const userLang = extractLanguage(messages);
  const question = extractQuestion(messages);

  const state = {
    enabled: false,
    staffLang: 'en',
    userLang,
    question,
    initialized: true
  };

  ticketState.set(channel.id, state);

  // 🔥 translate ticket question for preview
  const translatedQuestion = question
    ? (await translateText(question, 'en')).text
    : null;

  const setupEmbed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('Translation System')
    .addFields(
      { name: 'User Language', value: state.userLang.toUpperCase() },
      { name: 'Staff Language', value: state.staffLang.toUpperCase() },
      {
        name: 'Ticket Question (Translated)',
        value: translatedQuestion
          ? translatedQuestion.slice(0, 1024)
          : 'Not found'
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('translate_yes')
      .setLabel('Enable')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('translate_no')
      .setLabel('Disable')
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({
    embeds: [setupEmbed],
    components: [row]
  });

  const collector = msg.createMessageComponentCollector({ time: 60000 });

  collector.on('collect', async (i) => {
    const st = ticketState.get(channel.id);

    if (i.customId === 'translate_yes') {
      st.enabled = true;

      await i.update({
        content: '✅ Enabled',
        embeds: [],
        components: []
      });

    } else {
      st.enabled = false;

      await i.update({
        content: '❌ Disabled',
        embeds: [],
        components: []
      });
    }

    ticketState.set(channel.id, st);
    collector.stop();
  });

  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));

  return state;
}

// =========================
// MESSAGE BRIDGE
// =========================

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot || message.webhookId) return;
    if (!message.channel.parentId || !allowedCategories.has(message.channel.parentId)) return;

    if (message.createdTimestamp < botReadyAt) return;

    // 🚫 ignore commands
    if (message.content.startsWith('!ticket-lang')) return;

    const channelId = message.channel.id;

    if (ignoredTickets.has(channelId)) {
    console.log(`[IGNORED] ${message.channel.name} (${channelId})`);
    return;
}

    if (!ticketState.has(channelId)) {
      await initTicket(message.channel);
    }

    const state = ticketState.get(channelId);
    if (!state?.enabled) return;

    const raw = message.content;
    if (!raw) return;

    const isStaffMember = isStaff(message.member);

    // 🔁 BIDIRECTIONAL LOGIC
    const targetLang = isStaffMember ? state.userLang : state.staffLang;

    const result = await translateText(raw, targetLang);

    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(isStaffMember ? 0x5865F2 : 0x57F287)
      .addFields(
        {
          name: isStaffMember ? 'Staff Message' : 'User Message',
          value: raw.slice(0, 1024)
        },
        {
          name: 'Translated Message',
          value: result.text.slice(0, 1024)
        }
      )
      .setFooter({
        text: `${isStaffMember ? 'STAFF → USER' : 'USER → STAFF'} (${targetLang.toUpperCase()})`
      });

    const webhook = await getWebhook(message.channel);

    await webhook.send({
      username: `${message.member.displayName}`,
      avatarURL: message.author.displayAvatarURL(),
      embeds: [embed]
    });

  } catch (err) {
    console.error(err);
  }
});

// =========================
// STAFF COMMANDS
// =========================

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith('!ticket-lang')) return;
    if (!isStaff(message.member)) return;

    const args = message.content.split(' ');
    const state = ticketState.get(message.channel.id);

if (ignoredTickets.has(message.channel.id)) {
  return message.reply(
    "Translation is not supported for this ticket."
  );
}

    if (!state) return message.reply('This ticket already exists, and translations are not enabled for it.');

    const sub = args[1];

    if (sub === 'view') {
      return message.reply(
        `**User Language**: ${state.userLang}\n**Staff Language**: ${state.staffLang}`
      );
    }
if (sub === 'set') {
  const type = args[2];

  const input = args.slice(3).join(" ").toLowerCase().trim();
  const lang = LANGUAGE_MAP[input];

  if (!lang) {
    return message.reply(
      "Invalid language. Example: `english`, `french`, `spanish`, `japanese`, or `fr`, `es`, `ja`."
    );
  }

  if (type === "user") {
    state.userLang = lang;
  } else if (type === "staff") {
    state.staffLang = lang;
  } else {
    return message.reply("Use `user` or `staff`.");
  }

  ticketState.set(message.channel.id, state);

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("Language Updated")
        .addFields(
          {
            name: "Target",
            value: type === "user" ? "User Language" : "Staff Language",
            inline: true
          },
          {
            name: "New Language",
            value: lang.toUpperCase(),
            inline: true
          }
        )
        .setFooter({ text: "Changes apply instantly" })
    ]
  });
}

    return message.reply({
  embeds: [
    new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('Language Command Help')
      .setDescription('Set how this ticket translates messages')
      .addFields(
        {
          name: 'Format',
          value: '`!ticket-lang set user <lang>`\n`!ticket-lang set staff <lang>`'
        },
        {
          name: 'Examples',
          value: '`!ticket-lang set staff de`\n`!ticket-lang set user fr`'
        },
        {
          name: 'Valid Languages',
          value: 'en, fr, de, es, it, ja, ko, zh, ru, etc.'
        }
      )
      .setFooter({ text: 'This only affects this ticket' })
  ]
});
  } catch (err) {
    console.error(err);
  }
});

// =========================
// READY
// =========================

client.once('ready', async () => {
  console.log(`[READY] Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    const channels = await guild.channels.fetch();

    channels.forEach(channel => {
      if (
        channel?.parentId &&
        allowedCategories.has(channel.parentId)
      ) {
        ignoredTickets.add(channel.id);
      }
    });
  }

  console.log(
    `[CACHE] Ignoring ${ignoredTickets.size} existing ticket(s). Only new tickets will support translations.`
  );
});

client.login(process.env.DISCORD_TOKEN);
