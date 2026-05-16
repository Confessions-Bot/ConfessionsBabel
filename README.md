# Discord Gemini Translation Bot

AI-powered Discord support translation bot using Google's Gemini API.

## Features

- Detects user language automatically
- Staff messages translated into user language
- User messages translated into English
- Uses Discord webhooks + embeds
- Deletes original messages
- Adds AI translation warning footer
- FREE Gemini API support

---

# Setup Guide

## 1. Install Node.js

Download:
https://nodejs.org

Install the LTS version.

Verify install:

```bash
node -v
npm -v
```

---

## 2. Create a Discord Bot

Go to:
https://discord.com/developers/applications

### Create Bot

- New Application
- Name it
- Go to Bot tab
- Reset Token
- Copy token

### Enable Intents

Enable:
- Message Content Intent
- Server Members Intent

### Invite Bot

OAuth2 -> URL Generator

Scopes:
- bot

Permissions:
- Manage Webhooks
- Manage Messages
- Send Messages
- Embed Links
- Read Message History

Invite bot to your server.

---

## 3. Get FREE Gemini API Key

Go to:
https://aistudio.google.com/app/apikey

### Steps

1. Sign into Google
2. Click "Create API Key"
3. Copy API key

Gemini has a generous free tier.

---

## 4. Configure Bot

Rename:

`.env.example`

to:

`.env`

Then fill in:

```env
DISCORD_TOKEN=your_bot_token
GEMINI_API_KEY=your_gemini_key
```

---

## 5. Install Dependencies

Open terminal in bot folder:

```bash
npm install
```

---

## 6. Start Bot

```bash
npm start
```

If successful:

```bash
Logged in as YourBotName
```

---

# How It Works

- User opens support ticket
- User sends message in another language
- Bot detects language automatically
- Staff messages get translated for user
- User messages get translated into English
- Original messages are deleted
- Translated embeds are reposted

---

# Notes

- First user message determines ticket language
- English messages are skipped
- AI translations may occasionally contain mistakes