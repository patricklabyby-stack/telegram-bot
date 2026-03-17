const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

if (!token) {
  throw new Error("BOT_TOKEN не найден");
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL не найден");
}

const bot = new TelegramBot(token, { polling: true });

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// =========================
// SERVER
// =========================
app.get("/", (req, res) => {
  res.send("Бот работает");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// =========================
// БАЗА
// =========================
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      kills INTEGER DEFAULT 0,
      hugs INTEGER DEFAULT 0,
      kisses INTEGER DEFAULT 0,
      hits INTEGER DEFAULT 0,
      bites INTEGER DEFAULT 0,
      pats INTEGER DEFAULT 0,
      kicks INTEGER DEFAULT 0,
      slaps INTEGER DEFAULT 0,
      punches INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_messages (
      message_id BIGINT PRIMARY KEY,
      target_user_id BIGINT NOT NULL
    );
  `);

  console.log("Database ready");
}

// =========================
// УТИЛИТЫ
// =========================
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getUserName(user) {
  if (!user) return "Пользователь";

  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || user.username || "Пользователь";
}

function getUserLink(user) {
  return `<a href="tg://user?id=${user.id}">${escapeHtml(getUserName(user))}</a>`;
}

async function initUser(user) {
  if (!user || !user.id) return;

  await pool.query(
    `
    INSERT INTO users (user_id, first_name, last_name, username)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      username = EXCLUDED.username
    `,
    [
      user.id,
      user.first_name || "",
      user.last_name || "",
      user.username || ""
    ]
  );
}

async function getUserStats(userId) {
  const result = await pool.query(
    `SELECT * FROM users WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function getStoredUser(userId) {
  const stats = await getUserStats(userId);
  if (!stats) return null;

  return {
    id: Number(stats.user_id),
    first_name: stats.first_name || "",
    last_name: stats.last_name || "",
    username: stats.username || ""
  };
}

async function saveProfileMessage(messageId, targetUserId) {
  await pool.query(
    `
    INSERT INTO profile_messages (message_id, target_user_id)
    VALUES ($1, $2)
    ON CONFLICT (message_id)
    DO UPDATE SET target_user_id = EXCLUDED.target_user_id
    `,
    [messageId, targetUserId]
  );
}

async function getProfileOwnerByMessageId(messageId) {
  const result = await pool.query(
    `SELECT target_user_id FROM profile_messages WHERE message_id = $1`,
    [messageId]
  );

  return result.rows[0] ? Number(result.rows[0].target_user_id) : null;
}

async function incrementStat(targetUserId, statField) {
  const allowedFields = [
    "kills",
    "hugs",
    "kisses",
    "hits",
    "bites",
    "pats",
    "kicks",
    "slaps",
    "punches"
  ];

  if (!allowedFields.includes(statField)) return;

  await pool.query(
    `
    UPDATE users
    SET ${statField} = ${statField} + 1,
        total = total + 1
    WHERE user_id = $1
    `,
    [targetUserId]
  );
}

async function getProfileText(user) {
  await initUser(user);
  const stats = await getUserStats(user.id);

  return `👤 Профиль пользователя

Имя: ${getUserLink(user)}
ID: ${user.id}

📊 Статистика:
💀 Убили: ${stats.kills}
❤️ Обняли: ${stats.hugs}
💋 Поцеловали: ${stats.kisses}
👊 Ударили: ${stats.hits}
😈 Укусили: ${stats.bites}
🤲 Погладили: ${stats.pats}
🦵 Пнули: ${stats.kicks}
🖐 Шлёпнули: ${stats.slaps}
🥊 Врезали: ${stats.punches}

🔥 Всего взаимодействий: ${stats.total}`;
}

async function sendProfile(chatId, targetUser, replyToMessageId = undefined) {
  const text = await getProfileText(targetUser);

  const sent = await bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_to_message_id: replyToMessageId
  });

  await saveProfileMessage(sent.message_id, targetUser.id);
  return sent;
}

async function resolveTargetUserFromReply(msg) {
  if (!msg.reply_to_message) return null;

  const replyMsg = msg.reply_to_message;

  const profileOwnerId = await getProfileOwnerByMessageId(replyMsg.message_id);
  if (profileOwnerId) {
    return await getStoredUser(profileOwnerId);
  }

  if (replyMsg.from && !replyMsg.from.is_bot) {
    await initUser(replyMsg.from);
    return replyMsg.from;
  }

  return null;
}

// =========================
// РП КОМАНДЫ
// =========================
const rpCommands = {
  "убить": { text: "убил", stat: "kills", emoji: "💀" },
  "обнять": { text: "обнял", stat: "hugs", emoji: "❤️" },
  "поцеловать": { text: "поцеловал", stat: "kisses", emoji: "💋" },
  "ударить": { text: "ударил", stat: "hits", emoji: "👊" },
  "укусить": { text: "укусил", stat: "bites", emoji: "😈" },
  "погладить": { text: "погладил", stat: "pats", emoji: "🤲" },
  "пнуть": { text: "пнул", stat: "kicks", emoji: "🦵" },
  "шлепнуть": { text: "шлёпнул", stat: "slaps", emoji: "🖐" },
  "врезать": { text: "врезал", stat: "punches", emoji: "🥊" }
};

// =========================
// /start
// =========================
bot.onText(/^\/start$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `🔥 RP BOT

Команды:
убить
обнять
поцеловать
ударить
укусить
погладить
пнуть
шлепнуть
врезать

/profile — показать свой профиль
/profile ответом — показать профиль игрока

Как использовать:
1. Ответь на сообщение игрока
2. Напиши команду

Пример:
убить`
  );
});

// =========================
// /profile
// =========================
bot.onText(/^\/profile$/, async (msg) => {
  try {
    let targetUser = null;

    if (msg.reply_to_message) {
      targetUser = await resolveTargetUserFromReply(msg);
    }

    if (!targetUser) {
      targetUser = msg.from;
    }

    await initUser(targetUser);
    await sendProfile(msg.chat.id, targetUser, msg.message_id);
  } catch (error) {
    console.error("Ошибка /profile:", error);
    await bot.sendMessage(msg.chat.id, "Ошибка при открытии профиля.");
  }
});

// =========================
// ОБРАБОТКА СООБЩЕНИЙ
// =========================
bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;
    if (!msg.from) return;
    if (msg.from.is_bot) return;

    const text = msg.text.trim().toLowerCase();

    if (text.startsWith("/")) return;

    const command = rpCommands[text];
    if (!command) return;

    const sender = msg.from;
    await initUser(sender);

    const target = await resolveTargetUserFromReply(msg);

    if (!target) {
      await bot.sendMessage(
        msg.chat.id,
        "Ответь на сообщение игрока этой командой."
      );
      return;
    }

    await initUser(target);

    if (sender.id === target.id) {
      await bot.sendMessage(
        msg.chat.id,
        `😅 ${getUserLink(sender)} ${command.text} самого себя`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    await incrementStat(target.id, command.stat);

    await bot.sendMessage(
      msg.chat.id,
      `${command.emoji} ${getUserLink(sender)} ${command.text} ${getUserLink(target)}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
  }
});

bot.on("polling_error", (error) => {
  console.error("Polling error:", error?.message || error);
});

// =========================
// ЗАПУСК
// =========================
(async () => {
  try {
    await initDb();
    console.log("Bot started");
  } catch (error) {
    console.error("Ошибка запуска:", error);
  }
})();
