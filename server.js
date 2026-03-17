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
  ssl: { rejectUnauthorized: false }
});

const chatMembers = {};
const muteTimers = {};

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
      licks INTEGER DEFAULT 0,
      steals INTEGER DEFAULT 0,
      scams INTEGER DEFAULT 0,
      destroys INTEGER DEFAULT 0,
      wakes INTEGER DEFAULT 0,
      freezes INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      last_daily_at TIMESTAMPTZ,
      last_hunt_at TIMESTAMPTZ,
      last_sniper_at TIMESTAMPTZ,
      total INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_messages (
      message_id BIGINT PRIMARY KEY,
      target_user_id BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_mutes (
      chat_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      until_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (chat_id, user_id)
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hugs INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kisses INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hits INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bites INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pats INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kicks INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS slaps INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS punches INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS licks INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS steals INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS scams INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS destroys INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wakes INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS freezes INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_hunt_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sniper_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`);

  console.log("✅ Database ready");
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

  const firstName = (user.first_name || "").trim();
  const lastName = (user.last_name || "").trim();
  const username = (user.username || "").trim();

  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName && fullName !== ".") return fullName;
  if (username) return username;
  if (firstName) return firstName;
  return user.id ? `ID ${user.id}` : "Пользователь";
}

function getUserLink(user) {
  if (!user || !user.id) {
    return escapeHtml(getUserName(user));
  }

  return `<a href="tg://user?id=${user.id}">${escapeHtml(getUserName(user))}</a>`;
}

function getRandomGift() {
  const gifts = [
    "шоколад 🍫",
    "цветы 🌹",
    "плюшевого мишку 🧸",
    "пиццу 🍕",
    "айфон 📱",
    "конфеты 🍬",
    "торт 🎂",
    "звезду ⭐",
    "машину 🏎️",
    "деньги 💸",
    "кольцо 💍",
    "мороженое 🍦",
    "сок 🧃",
    "бургер 🍔",
    "печенье 🍪"
  ];

  return gifts[Math.floor(Math.random() * gifts.length)];
}

function getRandomRating() {
  return Math.floor(Math.random() * 10) + 1;
}

function getRandomPrediction() {
  const predictions = [
    "Сегодня тебе повезёт 😎",
    "Будь осторожен сегодня 😬",
    "Тебя ждёт сюрприз 🎁",
    "Сегодня твой день 🔥",
    "Лучше отдохни 😴",
    "Сегодня удача на твоей стороне 🍀",
    "Возможны проблемы 💀",
    "Жди хороших новостей 📩",
    "Сегодня будет весело 😂",
    "Не рискуй сегодня ⚠️"
  ];

  return predictions[Math.floor(Math.random() * predictions.length)];
}

function addChatMember(chatId, user) {
  if (!chatId || !user || !user.id || user.is_bot) return;

  const key = String(chatId);

  if (!chatMembers[key]) {
    chatMembers[key] = {};
  }

  chatMembers[key][String(user.id)] = {
    id: user.id,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    username: user.username || ""
  };
}

function getRandomChatMember(chatId) {
  const key = String(chatId);
  const members = Object.values(chatMembers[key] || {});

  if (!members.length) return null;

  return members[Math.floor(Math.random() * members.length)];
}

function getRandomCoins() {
  return Math.floor(Math.random() * 101);
}

function getRandomHuntCoins() {
  return Math.floor(Math.random() * 11);
}

function getHuntResult() {
  const normalAnimals = [
    { animal: "🐰 Поймал зайца!" },
    { animal: "🦊 Поймал лису!" },
    { animal: "🐗 Поймал кабана!" },
    { animal: "🦌 Поймал оленя!" }
  ];

  const isBear = Math.random() < 0.25;

  if (isBear) {
    return {
      text: "🐻 Ты нашёл медведя... Он тебя съел!",
      coins: -getRandomHuntCoins()
    };
  }

  const chosen = normalAnimals[Math.floor(Math.random() * normalAnimals.length)];
  return {
    text: chosen.animal,
    coins: getRandomHuntCoins()
  };
}

function getSniperResult() {
  const hit = Math.random() < 0.5;

  if (hit) {
    return {
      text: "💥 Попадание!",
      coins: Math.floor(Math.random() * 11)
    };
  }

  return {
    text: "❌ Промах!",
    coins: 0
  };
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} мин`;
  }

  return `${hours} ч ${minutes} мин`;
}

function parseMuteDuration(text) {
  const match = text.match(/^отключить\s+(\d+)\s*(мин|минута|минут|час|часа|часов|день|дня|дней)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  let ms = 0;

  if (["мин", "минута", "минут"].includes(unit)) {
    ms = value * 60 * 1000;
  } else if (["час", "часа", "часов"].includes(unit)) {
    ms = value * 60 * 60 * 1000;
  } else if (["день", "дня", "дней"].includes(unit)) {
    ms = value * 24 * 60 * 60 * 1000;
  }

  if (ms <= 0) return null;

  return { value, unit, ms };
}

function formatMuteText(value, unit) {
  return `${value} ${unit}`;
}

function getMuteKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

// =========================
// БАЗОВЫЕ ФУНКЦИИ БД
// =========================
async function initUser(user) {
  if (!user || !user.id) return;

  await pool.query(
    `
    INSERT INTO users (user_id, first_name, last_name, username)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id)
    DO UPDATE SET
      first_name = CASE
        WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name
        ELSE users.first_name
      END,
      last_name = CASE
        WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name
        ELSE users.last_name
      END,
      username = CASE
        WHEN EXCLUDED.username <> '' THEN EXCLUDED.username
        ELSE users.username
      END
    `,
    [
      user.id,
      (user.first_name || "").trim(),
      (user.last_name || "").trim(),
      (user.username || "").trim()
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
    "punches",
    "licks",
    "steals",
    "scams",
    "destroys",
    "wakes",
    "freezes"
  ];

  if (!allowedFields.includes(statField)) return;

  const result = await pool.query(
    `
    UPDATE users
    SET ${statField} = ${statField} + 1,
        total = total + 1
    WHERE user_id = $1
    RETURNING *
    `,
    [targetUserId]
  );

  console.log("✅ stat updated:", statField, "for", targetUserId, result.rows[0]);
}

// =========================
// МОНЕТЫ / ОХОТА / СНАЙПЕР
// =========================
async function claimDailyCoins(userId) {
  const result = await pool.query(
    `SELECT balance, last_daily_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    return { ok: false, reason: "not_found" };
  }

  const row = result.rows[0];
  const now = new Date();
  const lastDailyAt = row.last_daily_at ? new Date(row.last_daily_at) : null;
  const cooldownMs = 24 * 60 * 60 * 1000;

  if (lastDailyAt) {
    const nextTime = new Date(lastDailyAt.getTime() + cooldownMs);

    if (now < nextTime) {
      return {
        ok: false,
        remainingMs: nextTime.getTime() - now.getTime()
      };
    }
  }

  const coins = getRandomCoins();

  const updateResult = await pool.query(
    `
    UPDATE users
    SET balance = balance + $2,
        last_daily_at = NOW()
    WHERE user_id = $1
    RETURNING balance
    `,
    [userId, coins]
  );

  return {
    ok: true,
    coins,
    balance: updateResult.rows[0].balance
  };
}

async function runHunt(userId) {
  const result = await pool.query(
    `SELECT balance, last_hunt_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    return { ok: false, reason: "not_found" };
  }

  const row = result.rows[0];
  const now = new Date();
  const lastHuntAt = row.last_hunt_at ? new Date(row.last_hunt_at) : null;
  const cooldownMs = 24 * 60 * 60 * 1000;

  if (lastHuntAt) {
    const nextTime = new Date(lastHuntAt.getTime() + cooldownMs);

    if (now < nextTime) {
      return {
        ok: false,
        remainingMs: nextTime.getTime() - now.getTime()
      };
    }
  }

  const hunt = getHuntResult();
  let newBalance = Number(row.balance || 0) + hunt.coins;

  if (newBalance < 0) {
    newBalance = 0;
  }

  const updateResult = await pool.query(
    `
    UPDATE users
    SET balance = $2,
        last_hunt_at = NOW()
    WHERE user_id = $1
    RETURNING balance
    `,
    [userId, newBalance]
  );

  return {
    ok: true,
    hunt,
    balance: updateResult.rows[0].balance
  };
}

async function runSniper(userId) {
  const result = await pool.query(
    `SELECT balance, last_sniper_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    return { ok: false, reason: "not_found" };
  }

  const row = result.rows[0];
  const now = new Date();
  const lastSniperAt = row.last_sniper_at ? new Date(row.last_sniper_at) : null;
  const cooldownMs = 24 * 60 * 60 * 1000;

  if (lastSniperAt) {
    const nextTime = new Date(lastSniperAt.getTime() + cooldownMs);

    if (now < nextTime) {
      return {
        ok: false,
        remainingMs: nextTime.getTime() - now.getTime()
      };
    }
  }

  const sniper = getSniperResult();
  const newBalance = Number(row.balance || 0) + sniper.coins;

  const updateResult = await pool.query(
    `
    UPDATE users
    SET balance = $2,
        last_sniper_at = NOW()
    WHERE user_id = $1
    RETURNING balance
    `,
    [userId, newBalance]
  );

  return {
    ok: true,
    sniper,
    balance: updateResult.rows[0].balance
  };
}

// =========================
// МУТЫ
// =========================
async function saveMute(chatId, userId, untilDate) {
  await pool.query(
    `
    INSERT INTO active_mutes (chat_id, user_id, until_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET until_at = EXCLUDED.until_at
    `,
    [chatId, userId, untilDate.toISOString()]
  );
}

async function deleteMute(chatId, userId) {
  await pool.query(
    `DELETE FROM active_mutes WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId]
  );
}

async function scheduleUnmute(chatId, user) {
  const key = getMuteKey(chatId, user.id);

  if (muteTimers[key]) {
    clearTimeout(muteTimers[key]);
    delete muteTimers[key];
  }

  const result = await pool.query(
    `SELECT until_at FROM active_mutes WHERE chat_id = $1 AND user_id = $2`,
    [chatId, user.id]
  );

  if (!result.rows[0]) return;

  const untilAt = new Date(result.rows[0].until_at);
  const delay = untilAt.getTime() - Date.now();

  const runUnmute = async () => {
    try {
      await bot.restrictChatMember(chatId, user.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false
        }
      });

      await deleteMute(chatId, user.id);

      await bot.sendMessage(
        chatId,
        `🔊 ${getUserLink(user)}, время отключения вышло. Теперь снова можно писать.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
    } catch (error) {
      console.error("Ошибка авто-включения:", error);
    } finally {
      if (muteTimers[key]) {
        clearTimeout(muteTimers[key]);
        delete muteTimers[key];
      }
    }
  };

  if (delay <= 0) {
    await runUnmute();
    return;
  }

  muteTimers[key] = setTimeout(runUnmute, delay);
}

async function restoreMuteTimers() {
  try {
    const result = await pool.query(`SELECT chat_id, user_id FROM active_mutes`);

    for (const row of result.rows) {
      const user = await getStoredUser(row.user_id);
      if (!user) continue;
      await scheduleUnmute(Number(row.chat_id), user);
    }

    console.log("✅ Mute timers restored");
  } catch (error) {
    console.error("Ошибка восстановления мутов:", error);
  }
}

// =========================
// PROFILE
// =========================
async function getProfileText(user) {
  await initUser(user);
  const stats = await getUserStats(user.id);

  return `👤 Профиль пользователя

Имя: ${getUserLink(user)}
ID: ${user.id}

💰 Монеты: ${stats.balance || 0}

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
👅 Лизнули: ${stats.licks}
🕵️ Обокрали: ${stats.steals}
💸 Заскамили: ${stats.scams}
☠️ Уничтожили: ${stats.destroys}
⏰ Разбудили: ${stats.wakes}
🧊 Заморозили: ${stats.freezes}

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
  "врезать": { text: "врезал", stat: "punches", emoji: "🥊" },
  "лизнуть": { text: "лизнул", stat: "licks", emoji: "👅" },
  "украсть": { text: "обокрал", stat: "steals", emoji: "🕵️" },
  "заскамить": { text: "заскамил", stat: "scams", emoji: "💸" },
  "уничтожить": { text: "уничтожил", stat: "destroys", emoji: "☠️" },
  "разбудить": { text: "разбудил", stat: "wakes", emoji: "⏰" },
  "заморозить": { text: "заморозил", stat: "freezes", emoji: "🧊" }
};

// =========================
// START
// =========================
bot.onText(/^\/start(@[A-Za-z0-9_]+)?$/, async (msg) => {
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
лизнуть
украсть
заскамить
уничтожить
разбудить
заморозить
подарок
кто ...
оценка
прогноз
деньги
охота
снайпер
отключить 2 мин
включить

/profile — показать свой профиль
/profile ответом — показать профиль человека`
  );
});

// =========================
// PROFILE
// =========================
bot.onText(/^\/profile(@[A-Za-z0-9_]+)?$/, async (msg) => {
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
    if (!msg.text || !msg.from || msg.from.is_bot) return;

    addChatMember(msg.chat.id, msg.from);
    await initUser(msg.from);

    const text = msg.text.trim();
    const lowerText = text.toLowerCase();

    if (lowerText.startsWith("/")) return;

    // =========================
    // ОТКЛЮЧИТЬ
    // =========================
    if (lowerText.startsWith("отключить ")) {
      if (!msg.reply_to_message || !msg.reply_to_message.from) {
        await bot.sendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши, например: отключить 2 мин"
        );
        return;
      }

      const parsed = parseMuteDuration(lowerText);

      if (!parsed) {
        await bot.sendMessage(
          msg.chat.id,
          "Неправильный формат. Пример: отключить 2 мин / отключить 1 час / отключить 3 дня"
        );
        return;
      }

      const target = msg.reply_to_message.from;

      if (target.is_bot) {
        await bot.sendMessage(msg.chat.id, "Бота отключить нельзя.");
        return;
      }

      if (target.id === msg.from.id) {
        await bot.sendMessage(msg.chat.id, "Себя отключить нельзя.");
        return;
      }

      const untilDate = new Date(Date.now() + parsed.ms);
      const untilUnix = Math.floor(untilDate.getTime() / 1000);

      try {
        await bot.restrictChatMember(msg.chat.id, target.id, {
          permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false
          },
          until_date: untilUnix
        });

        await initUser(target);
        await saveMute(msg.chat.id, target.id, untilDate);
        await scheduleUnmute(msg.chat.id, target);

        await bot.sendMessage(
          msg.chat.id,
          `🔇 ${getUserLink(target)} отключён на ${escapeHtml(formatMuteText(parsed.value, parsed.unit))}. Теперь временно нельзя писать.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        console.error("Ошибка отключения:", error);
        await bot.sendMessage(
          msg.chat.id,
          "Не удалось отключить пользователя. Проверь, что бот админ и у него есть право ограничивать участников."
        );
      }

      return;
    }

    // =========================
    // ВКЛЮЧИТЬ
    // =========================
    if (lowerText === "включить") {
      if (!msg.reply_to_message || !msg.reply_to_message.from) {
        await bot.sendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши: включить"
        );
        return;
      }

      const target = msg.reply_to_message.from;

      if (target.is_bot) {
        await bot.sendMessage(msg.chat.id, "Бота включать не нужно.");
        return;
      }

      try {
        await bot.restrictChatMember(msg.chat.id, target.id, {
          permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false
          }
        });

        await deleteMute(msg.chat.id, target.id);

        const key = getMuteKey(msg.chat.id, target.id);
        if (muteTimers[key]) {
          clearTimeout(muteTimers[key]);
          delete muteTimers[key];
        }

        await bot.sendMessage(
          msg.chat.id,
          `🔊 ${getUserLink(target)}, время отключения вышло. Теперь снова можно писать.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        console.error("Ошибка включения:", error);
        await bot.sendMessage(
          msg.chat.id,
          "Не удалось включить пользователя. Проверь, что бот админ и у него есть право ограничивать участников."
        );
      }

      return;
    }

    // =========================
    // ДЕНЬГИ
    // =========================
    if (lowerText === "деньги" || lowerText === "монеты") {
      const result = await claimDailyCoins(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await bot.sendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, получить монеты снова можно через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await bot.sendMessage(
        msg.chat.id,
        `💰 ${getUserLink(msg.from)}, вы получили ${result.coins} монет!\n\nБаланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // ОХОТА
    // =========================
    if (lowerText === "охота") {
      const result = await runHunt(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await bot.sendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, на охоту снова можно идти через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      let coinsLine = "😐 0 монет";

      if (result.hunt.coins > 0) {
        coinsLine = `💰 +${result.hunt.coins} монет`;
      } else if (result.hunt.coins < 0) {
        coinsLine = `💀 ${result.hunt.coins} монет`;
      }

      await bot.sendMessage(
        msg.chat.id,
        `🏹 ${getUserLink(msg.from)} отправился на охоту...

${escapeHtml(result.hunt.text)}
${coinsLine}

Баланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // СНАЙПЕР
    // =========================
    if (lowerText === "снайпер") {
      const result = await runSniper(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await bot.sendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, играть в снайпера снова можно через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      let coinsLine = "😐 0 монет";

      if (result.sniper.coins > 0) {
        coinsLine = `💰 +${result.sniper.coins} монет`;
      }

      await bot.sendMessage(
        msg.chat.id,
        `🎯 ${getUserLink(msg.from)} прицелился...

${escapeHtml(result.sniper.text)}
${coinsLine}

Баланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // ПРОГНОЗ
    // =========================
    if (lowerText === "прогноз") {
      const prediction = getRandomPrediction();

      await bot.sendMessage(
        msg.chat.id,
        `🔮 ${getUserLink(msg.from)}\n${escapeHtml(prediction)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // ОЦЕНКА
    // =========================
    if (lowerText.startsWith("оценка")) {
      let target = null;

      if (msg.reply_to_message && msg.reply_to_message.from) {
        target = msg.reply_to_message.from;
      } else {
        const parts = text.split(" ");
        if (parts.length > 1) {
          target = {
            first_name: parts.slice(1).join(" ")
          };
        } else {
          target = msg.from;
        }
      }

      const rating = getRandomRating();

      await bot.sendMessage(
        msg.chat.id,
        `📊 Оценка ${escapeHtml(getUserName(target))}: ${rating}/10 😎`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // КТО ...
    // =========================
    if (lowerText.startsWith("кто ")) {
      const subject = text.slice(4).trim();

      if (!subject) {
        await bot.sendMessage(msg.chat.id, "Напиши, например: кто лучший");
        return;
      }

      const randomUser = getRandomChatMember(msg.chat.id);

      if (!randomUser) {
        await bot.sendMessage(msg.chat.id, "Пока некого выбрать 🤔");
        return;
      }

      await bot.sendMessage(
        msg.chat.id,
        `🤔 ${escapeHtml(subject)}? Думаю это ${getUserLink(randomUser)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // ПОДАРОК
    // =========================
    if (lowerText === "подарок") {
      const sender = msg.from;
      await initUser(sender);

      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await bot.sendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши: подарок"
        );
        return;
      }

      await initUser(target);

      if (sender.id === target.id) {
        await bot.sendMessage(
          msg.chat.id,
          `🎁 ${getUserLink(sender)} подарил(а) подарок самому себе`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const gift = getRandomGift();

      await bot.sendMessage(
        msg.chat.id,
        `🎁 ${getUserLink(sender)} подарил(а) ${getUserLink(target)} ${escapeHtml(gift)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    const command = rpCommands[lowerText];
    if (!command) return;

    const sender = msg.from;
    await initUser(sender);

    const target = await resolveTargetUserFromReply(msg);

    if (!target) {
      await bot.sendMessage(msg.chat.id, "Ответь на сообщение человека этой командой.");
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
    const test = await pool.query("SELECT NOW()");
    console.log("✅ DB connected:", test.rows[0]);

    await initDb();
    await restoreMuteTimers();

    console.log("✅ Bot started");
  } catch (error) {
    console.error("❌ Ошибка запуска:", error);
  }
})();
