const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { Pool } = require("pg");

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_ID = 7837011810;
const PORT = process.env.PORT || 3000;

const MAX_GREETING_LENGTH = 1000;
const WELCOME_DEDUPE_MS = 10000;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN not found");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const waitingGreeting = new Map();
const recentWelcomes = new Map();
const usersCache = new Map();

const HELP_TEXT = `👋 Привет! Я Artemwe Moderator.

Команды:
create greeting
edit greeting
show greeting
delete greeting
cancel greeting
/help

RP команда:
/jail

Как работает приветствие:
1. create greeting
2. бот просит текст
3. ты отправляешь текст
4. бот сохраняет его

Можно использовать {name}

Пример:
Привет {name}! Добро пожаловать в группу.`;

const GREETING_COMMANDS = new Set([
  "create greeting",
  "edit greeting",
  "show greeting",
  "delete greeting",
  "cancel greeting"
]);

/* =========================
   DB
========================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("DB ready");
}

async function getGreeting(chatId) {
  const result = await pool.query(
    "SELECT text FROM greetings WHERE chat_id = $1",
    [String(chatId)]
  );

  return result.rows.length ? result.rows[0].text : null;
}

async function saveGreeting(chatId, text) {
  await pool.query(
    `
    INSERT INTO greetings (chat_id, text, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (chat_id)
    DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()
    `,
    [String(chatId), text]
  );
}

async function removeGreeting(chatId) {
  await pool.query(
    "DELETE FROM greetings WHERE chat_id = $1",
    [String(chatId)]
  );
}

/* =========================
   HELPERS
========================= */

async function safeSendMessage(chatId, text, extra = {}) {
  try {
    return await bot.sendMessage(chatId, text, extra);
  } catch (error) {
    console.error("sendMessage error:", error.message);
    return null;
  }
}

function normalizeText(text) {
  return String(text || "").trim();
}

function lowerText(text) {
  return normalizeText(text).toLowerCase();
}

function normalizeUsername(username) {
  if (!username) return null;
  return String(username).replace(/^@/, "").trim().toLowerCase() || null;
}

function getAccountName(user) {
  if (!user) return "Игрок";

  const firstName = user.first_name || "";
  const lastName = user.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "Игрок";
}

function cacheUser(user) {
  if (!user) return;

  const normalized = normalizeUsername(user.username);
  if (!normalized) return;

  usersCache.set(normalized, getAccountName(user));
}

function resolveTargetFromCommandArg(rawArg) {
  if (!rawArg) return null;

  const trimmed = rawArg.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("@")) {
    const normalized = normalizeUsername(trimmed);
    if (!normalized) return trimmed;

    if (usersCache.has(normalized)) {
      return usersCache.get(normalized);
    }

    return `@${normalized}`;
  }

  return trimmed;
}

async function canManage(chatId, userId) {
  if (userId === OWNER_ID) return true;

  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === "administrator" || member.status === "creator";
  } catch (error) {
    console.error("Admin check error:", error.message);
    return false;
  }
}

function isSystemEventMessage(msg) {
  return Boolean(
    msg.new_chat_members ||
    msg.left_chat_member ||
    msg.group_chat_created ||
    msg.supergroup_chat_created ||
    msg.channel_chat_created ||
    msg.delete_chat_photo ||
    msg.migrate_from_chat_id ||
    msg.migrate_to_chat_id ||
    msg.pinned_message
  );
}

function cleanupExpiredWelcome(key, delayMs = WELCOME_DEDUPE_MS) {
  setTimeout(() => {
    recentWelcomes.delete(key);
  }, delayMs);
}

function isGreetingCommand(text) {
  return GREETING_COMMANDS.has(text);
}

/* =========================
   START / HELP
========================= */

bot.onText(/\/start/, async (msg) => {
  await safeSendMessage(msg.chat.id, HELP_TEXT);
});

bot.onText(/\/help/, async (msg) => {
  await safeSendMessage(msg.chat.id, HELP_TEXT);
});

/* =========================
   RP: JAIL
========================= */

bot.onText(/\/jail(?:\s+(.+))?/, async (msg, match) => {
  try {
    if (msg.from?.is_bot) return;

    cacheUser(msg.from);
    if (msg.reply_to_message?.from) cacheUser(msg.reply_to_message.from);

    const actorName = getAccountName(msg.from);
    let target = null;

    if (msg.reply_to_message?.from) {
      target = getAccountName(msg.reply_to_message.from);
    } else {
      const rawArg = match?.[1] || "";
      target = resolveTargetFromCommandArg(rawArg);
    }

    if (!target) {
      await safeSendMessage(
        msg.chat.id,
        "Кого посадить? Ответь на сообщение игрока или напиши: /jail @username"
      );
      return;
    }

    await safeSendMessage(
      msg.chat.id,
      `⛓️‍💥 | ${actorName} | посадил | ${target}`
    );
  } catch (error) {
    console.error("/jail error:", error.message);
  }
});

/* =========================
   MAIN MESSAGE HANDLER
========================= */

bot.on("message", async (msg) => {
  try {
    if (msg.from?.is_bot) return;

    if (msg.from) cacheUser(msg.from);
    if (msg.reply_to_message?.from) cacheUser(msg.reply_to_message.from);

    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const originalText = normalizeText(msg.text);

    if (!originalText) return;
    if (isSystemEventMessage(msg)) return;

    if (originalText.startsWith("/jail")) return;
    if (originalText === "/start" || originalText === "/help") return;

    const text = lowerText(originalText);

    /* ===== если бот ждёт текст приветствия ===== */
    if (waitingGreeting.has(chatId)) {
      const session = waitingGreeting.get(chatId);

      if (session.userId !== userId) return;

      if (text === "cancel greeting") {
        waitingGreeting.delete(chatId);
        await safeSendMessage(chatId, "❌ Ввод приветствия отменён.");
        return;
      }

      if (isGreetingCommand(text)) {
        await safeSendMessage(
          chatId,
          "❌ Сейчас бот ждёт текст приветствия. Напиши текст или используй: cancel greeting"
        );
        return;
      }

      if (!originalText) {
        await safeSendMessage(chatId, "❌ Текст пустой. Напиши текст приветствия.");
        return;
      }

      if (originalText.length > MAX_GREETING_LENGTH) {
        await safeSendMessage(
          chatId,
          `❌ Текст слишком длинный. Максимум ${MAX_GREETING_LENGTH} символов.`
        );
        return;
      }

      await saveGreeting(chatId, originalText);
      waitingGreeting.delete(chatId);

      await safeSendMessage(chatId, "✅ Приветствие сохранено.");
      return;
    }

    /* ===== create greeting ===== */
    if (text === "create greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await safeSendMessage(
          chatId,
          "❌ Только админы и владелец могут управлять приветствием."
        );
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (currentGreeting) {
        await safeSendMessage(
          chatId,
          "❌ У вас уже есть приветствие. Используй: edit greeting"
        );
        return;
      }

      waitingGreeting.set(chatId, {
        userId,
        mode: "create"
      });

      await safeSendMessage(chatId, "✏️ Напиши текст приветствия");
      return;
    }

    /* ===== edit greeting ===== */
    if (text === "edit greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await safeSendMessage(
          chatId,
          "❌ Только админы и владелец могут управлять приветствием."
        );
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
        await safeSendMessage(
          chatId,
          "❌ Приветствие ещё не создано. Используй: create greeting"
        );
        return;
      }

      waitingGreeting.set(chatId, {
        userId,
        mode: "edit"
      });

      await safeSendMessage(chatId, "✏️ Напиши новый текст приветствия");
      return;
    }

    /* ===== show greeting ===== */
    if (text === "show greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await safeSendMessage(
          chatId,
          "❌ Только админы и владелец могут управлять приветствием."
        );
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
        await safeSendMessage(chatId, "❌ Приветствие ещё не создано.");
        return;
      }

      await safeSendMessage(
        chatId,
        `📌 Текущее приветствие:\n\n${currentGreeting}`
      );
      return;
    }

    /* ===== delete greeting ===== */
    if (text === "delete greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await safeSendMessage(
          chatId,
          "❌ Только админы и владелец могут управлять приветствием."
        );
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
        await safeSendMessage(
          chatId,
          "❌ Приветствие уже удалено или не создано."
        );
        return;
      }

      await removeGreeting(chatId);
      waitingGreeting.delete(chatId);

      await safeSendMessage(chatId, "✅ Приветствие удалено.");
      return;
    }

    /* ===== cancel greeting ===== */
    if (text === "cancel greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await safeSendMessage(
          chatId,
          "❌ Только админы и владелец могут управлять приветствием."
        );
        return;
      }

      if (!waitingGreeting.has(chatId)) {
        await safeSendMessage(
          chatId,
          "❌ Сейчас нет активного ввода приветствия."
        );
        return;
      }

      const session = waitingGreeting.get(chatId);

      if (session.userId !== userId && userId !== OWNER_ID) {
        await safeSendMessage(chatId, "❌ Ты не можешь отменить чужой ввод.");
        return;
      }

      waitingGreeting.delete(chatId);
      await safeSendMessage(chatId, "❌ Ввод приветствия отменён.");
      return;
    }
  } catch (error) {
    console.error("Message handler error:", error.message);
  }
});

/* =========================
   WELCOME NEW MEMBERS
========================= */

bot.on("new_chat_members", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const greeting = await getGreeting(chatId);

    if (!greeting) return;

    for (const user of msg.new_chat_members) {
      if (user.is_bot) continue;

      const key = `${chatId}:${user.id}`;
      const now = Date.now();

      if (recentWelcomes.has(key) && now - recentWelcomes.get(key) < WELCOME_DEDUPE_MS) {
        continue;
      }

      recentWelcomes.set(key, now);
      cleanupExpiredWelcome(key, WELCOME_DEDUPE_MS);

      const name = user.first_name || user.username || "друг";
      const finalText = greeting.replace(/\{name\}/g, name);

      await safeSendMessage(chatId, finalText);
    }
  } catch (error) {
    console.error("new_chat_members error:", error.message);
  }
});

/* =========================
   EXPRESS
========================= */

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/* =========================
   START APP
========================= */

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("DB init error:", error.message);
    process.exit(1);
  });

bot.on("polling_error", (error) => {
  console.error("Polling error:", error.message);
});

bot.on("error", (error) => {
  console.error("Bot error:", error.message);
});
