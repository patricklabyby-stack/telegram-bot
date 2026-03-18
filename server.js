const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

if (!token) throw new Error("BOT_TOKEN не найден");
if (!databaseUrl) throw new Error("DATABASE_URL не найден");

const bot = new TelegramBot(token, { polling: true });

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

const chatMembers = {};
const pendingCommandCreation = {};
const activeBombs = {};
const recentActiveUsers = {};

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
// UTILS
// =========================
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isExactCommand(text, command) {
  return normalizeText(text) === normalizeText(command);
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
  if (!user || !user.id) return escapeHtml(getUserName(user));
  return `<a href="tg://user?id=${user.id}">${escapeHtml(getUserName(user))}</a>`;
}

async function safeSendMessage(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error("Ошибка sendMessage:", error?.message || error);
    return null;
  }
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(1, Math.ceil((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    if (minutes > 0) return `${hours} ч ${minutes} мин`;
    return `${hours} ч`;
  }

  if (minutes > 0) {
    if (seconds > 0) return `${minutes} мин ${seconds} сек`;
    return `${minutes} мин`;
  }

  return `${seconds} сек`;
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

function getLieResult() {
  const percent = Math.floor(Math.random() * 101);

  if (percent >= 85) return { percent, text: "💀 100% врёт" };
  if (percent >= 65) return { percent, text: "🤥 Похоже, он врёт" };
  if (percent >= 45) return { percent, text: "😐 Не могу понять" };
  return { percent, text: "✅ Скорее говорит правду" };
}

function getShopKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "💰 50 монет — 5 ⭐",
          callback_data: "buy_50_coins"
        }
      ]
    ]
  };
}

function getPendingKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function addChatMember(chatId, user) {
  if (!chatId || !user || !user.id || user.is_bot) return;

  const key = String(chatId);
  if (!chatMembers[key]) chatMembers[key] = {};

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

function getRandomFromArray(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// =========================
// BOMB
// =========================
function getBombChatKey(chatId) {
  return String(chatId);
}

function addRecentActiveUser(chatId, user) {
  if (!chatId || !user || !user.id || user.is_bot) return;

  const key = getBombChatKey(chatId);
  if (!recentActiveUsers[key]) recentActiveUsers[key] = {};

  recentActiveUsers[key][String(user.id)] = {
    id: user.id,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    username: user.username || "",
    last_seen_at: Date.now()
  };
}

function getRecentActiveCandidates(chatId, excludeUserIds = []) {
  const key = getBombChatKey(chatId);
  const users = Object.values(recentActiveUsers[key] || {});
  const now = Date.now();
  const activeWindowMs = 30 * 60 * 1000;

  return users.filter((user) => {
    if (!user || !user.id) return false;
    if (excludeUserIds.includes(user.id)) return false;
    return (now - (user.last_seen_at || 0)) <= activeWindowMs;
  });
}

function clearBomb(chatId) {
  const key = getBombChatKey(chatId);

  if (activeBombs[key]?.timer) {
    clearTimeout(activeBombs[key].timer);
  }

  delete activeBombs[key];
}

async function explodeBomb(chatId) {
  const key = getBombChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return;

  const holder = bomb.holder;
  clearBomb(chatId);

  await safeSendMessage(
    chatId,
    `💥 Бомба взорвалась!\n${getUserLink(holder)} не успел передать бомбу.`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
}

async function startBombTimer(chatId) {
  const key = getBombChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return;

  if (bomb.timer) {
    clearTimeout(bomb.timer);
  }

  bomb.timer = setTimeout(async () => {
    try {
      await explodeBomb(chatId);
    } catch (error) {
      console.error("Ошибка взрыва бомбы:", error);
    }
  }, 5000);
}

async function passBomb(chatId, fromUser) {
  const key = getBombChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return false;

  const excludeIds = [fromUser.id];
  if (bomb.previousHolderId) {
    excludeIds.push(bomb.previousHolderId);
  }

  let candidates = getRecentActiveCandidates(chatId, excludeIds);
  if (!candidates.length) {
    candidates = getRecentActiveCandidates(chatId, [fromUser.id]);
  }

  if (!candidates.length) {
    clearBomb(chatId);

    await safeSendMessage(
      chatId,
      `💣 ${getUserLink(fromUser)} попытался передать бомбу, но рядом никого не оказалось.\n\nБомба исчезла.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
    return true;
  }

  const nextHolder = getRandomFromArray(candidates);

  activeBombs[key] = {
    holder: nextHolder,
    previousHolderId: fromUser.id,
    timer: null
  };

  await safeSendMessage(
    chatId,
    `💣 ${getUserLink(fromUser)} передал бомбу!\n\n🔥 Теперь бомба у: ${getUserLink(nextHolder)}\n⏳ У него 5 секунд, чтобы написать: передать`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  await startBombTimer(chatId);
  return true;
}

// =========================
// DATABASE
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
      respect INTEGER DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS chat_seen_users (
      chat_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      PRIMARY KEY (chat_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS star_purchases (
      telegram_payment_charge_id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      payload TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      trigger TEXT NOT NULL UNIQUE,
      action_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS respect INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_hunt_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sniper_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`);

  console.log("✅ Database ready");
}

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

async function saveSeenUser(chatId, user) {
  if (!chatId || !user || !user.id || user.is_bot) return;

  await pool.query(
    `
    INSERT INTO chat_seen_users (chat_id, user_id, first_name, last_name, username)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET
      first_name = CASE
        WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name
        ELSE chat_seen_users.first_name
      END,
      last_name = CASE
        WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name
        ELSE chat_seen_users.last_name
      END,
      username = CASE
        WHEN EXCLUDED.username <> '' THEN EXCLUDED.username
        ELSE chat_seen_users.username
      END
    `,
    [
      chatId,
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

async function processStarPurchase(userId, successfulPayment) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
      SELECT telegram_payment_charge_id
      FROM star_purchases
      WHERE telegram_payment_charge_id = $1
      `,
      [successfulPayment.telegram_payment_charge_id]
    );

    if (existing.rows.length > 0) {
      const balanceRow = await client.query(
        `SELECT balance FROM users WHERE user_id = $1`,
        [userId]
      );

      await client.query("COMMIT");

      return {
        alreadyProcessed: true,
        balance: balanceRow.rows[0]?.balance || 0,
        coinsAdded: 0
      };
    }

    let coinsToAdd = 0;
    if (successfulPayment.invoice_payload === "coins_50") {
      coinsToAdd = 50;
    }

    await client.query(
      `
      INSERT INTO star_purchases (
        telegram_payment_charge_id,
        user_id,
        payload,
        amount,
        currency
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        successfulPayment.telegram_payment_charge_id,
        userId,
        successfulPayment.invoice_payload,
        successfulPayment.total_amount,
        successfulPayment.currency
      ]
    );

    const balanceResult = await client.query(
      `
      UPDATE users
      SET balance = COALESCE(balance, 0) + $2
      WHERE user_id = $1
      RETURNING balance
      `,
      [userId, coinsToAdd]
    );

    await client.query("COMMIT");

    return {
      alreadyProcessed: false,
      balance: balanceResult.rows[0]?.balance || 0,
      coinsAdded: coinsToAdd
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getRandomPairMembersFromDb(chatId) {
  const result = await pool.query(
    `
    SELECT user_id, first_name, last_name, username
    FROM chat_seen_users
    WHERE chat_id = $1
    ORDER BY RANDOM()
    LIMIT 2
    `,
    [chatId]
  );

  if (result.rows.length < 2) return null;

  return result.rows.map((row) => ({
    id: Number(row.user_id),
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    username: row.username || ""
  }));
}

// =========================
// CUSTOM COMMANDS
// =========================
async function getUserCustomCommandCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM custom_commands WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}

async function getUserCustomCommands(userId) {
  const result = await pool.query(
    `
    SELECT trigger, action_text
    FROM custom_commands
    WHERE user_id = $1
    ORDER BY created_at ASC
    `,
    [userId]
  );
  return result.rows;
}

async function getCustomCommandByTrigger(trigger) {
  const result = await pool.query(
    `
    SELECT id, user_id, trigger, action_text
    FROM custom_commands
    WHERE LOWER(trigger) = LOWER($1)
    LIMIT 1
    `,
    [trigger]
  );
  return result.rows[0] || null;
}

async function createCustomCommand(userId, trigger, actionText) {
  await pool.query(
    `
    INSERT INTO custom_commands (user_id, trigger, action_text)
    VALUES ($1, $2, $3)
    `,
    [userId, trigger, actionText]
  );
}

async function deleteCustomCommand(userId, trigger) {
  const result = await pool.query(
    `
    DELETE FROM custom_commands
    WHERE user_id = $1 AND LOWER(trigger) = LOWER($2)
    RETURNING trigger
    `,
    [userId, trigger]
  );
  return result.rows[0] || null;
}

function parseCreateCommandInput(text) {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  const parts = cleaned.split(" ");

  if (parts.length < 2) return null;

  const trigger = parts[0].trim().toLowerCase();
  const actionText = parts.slice(1).join(" ").trim();

  if (!trigger || !actionText) return null;
  return { trigger, actionText };
}

function isValidTrigger(trigger) {
  return /^[a-zA-Zа-яА-ЯёЁіІїЇєЄ0-9_-]{2,20}$/.test(trigger);
}

// =========================
// GAME
// =========================
async function claimDailyCoins(userId) {
  const result = await pool.query(
    `SELECT balance, last_daily_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) return { ok: false, reason: "not_found" };

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

  if (!result.rows[0]) return { ok: false, reason: "not_found" };

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
  if (newBalance < 0) newBalance = 0;

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

  if (!result.rows[0]) return { ok: false, reason: "not_found" };

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
// PROFILE
// =========================
async function getProfileText(user) {
  await initUser(user);
  const stats = await getUserStats(user.id);

  return `👤 Профиль пользователя

Имя: ${getUserLink(user)}
ID: ${user.id}

💰 Монеты: ${stats.balance || 0}
🤝 Респект: ${stats.respect || 0}

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
// STANDARD RP COMMANDS
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
// COMMANDS
// =========================
bot.onText(/^\/start(@[A-Za-z0-9_]+)?$/, async (msg) => {
  await safeSendMessage(
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
респект
кто ...
оценка
прогноз
деньги
охота
снайпер
пара
магазин
бомба
передать
он врет?
врет?
/createcommand
/mycommands
/deletecommand
/balance

/profile — показать свой профиль
/profile ответом — показать профиль игрока
/balance — показать баланс`
  );
});

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
    await safeSendMessage(msg.chat.id, "Ошибка при открытии профиля.");
  }
});

bot.onText(/^\/balance(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const stats = await getUserStats(msg.from.id);

    await safeSendMessage(
      msg.chat.id,
      `💰 ${getUserLink(msg.from)}, ваш баланс: ${stats.balance || 0} монет`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка /balance:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении баланса.");
  }
});

bot.onText(/^\/createcommand(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const count = await getUserCustomCommandCount(msg.from.id);
    if (count >= 5) {
      await safeSendMessage(
        msg.chat.id,
        "❌ У тебя уже максимум команд: 5\nУдалить можно через /deletecommand"
      );
      return;
    }

    const stats = await getUserStats(msg.from.id);
    if ((stats.balance || 0) < 20) {
      await safeSendMessage(
        msg.chat.id,
        "❌ Чтобы создать команду, нужно 20 монет."
      );
      return;
    }

    const key = getPendingKey(msg.chat.id, msg.from.id);
    pendingCommandCreation[key] = true;

    await safeSendMessage(
      msg.chat.id,
      `🛠 Создание команды

Цена: 20 монет
Максимум: 5 команд

Напиши в формате:
команда действие

Пример:
облил облил водой`
    );
  } catch (error) {
    console.error("Ошибка /createcommand:", error);
    await safeSendMessage(msg.chat.id, "Ошибка создания команды.");
  }
});

bot.onText(/^\/mycommands(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const commands = await getUserCustomCommands(msg.from.id);

    if (!commands.length) {
      await safeSendMessage(msg.chat.id, "📜 У тебя пока нет своих команд.");
      return;
    }

    const lines = commands.map((cmd, index) =>
      `${index + 1}. ${escapeHtml(cmd.trigger)} — бот пишет: ${escapeHtml(cmd.action_text)}`
    );

    await safeSendMessage(
      msg.chat.id,
      `📜 Твои команды:\n\n${lines.join("\n")}`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Ошибка /mycommands:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении команд.");
  }
});

bot.onText(/^\/deletecommand(@[A-Za-z0-9_]+)?(?:\s+(.+))?$/, async (msg, match) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const trigger = normalizeText(match?.[2] || "");
    if (!trigger) {
      await safeSendMessage(msg.chat.id, "❌ Напиши так:\n/deletecommand облил");
      return;
    }

    const deleted = await deleteCustomCommand(msg.from.id, trigger);
    if (!deleted) {
      await safeSendMessage(
        msg.chat.id,
        `❌ У тебя нет команды "${escapeHtml(trigger)}".`,
        { parse_mode: "HTML" }
      );
      return;
    }

    await safeSendMessage(
      msg.chat.id,
      `🗑 Команда "${escapeHtml(deleted.trigger)}" удалена.`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Ошибка /deletecommand:", error);
    await safeSendMessage(msg.chat.id, "Ошибка удаления команды.");
  }
});

// =========================
// TRACK USERS
// =========================
bot.on("message", async (msg) => {
  try {
    if (msg.from && !msg.from.is_bot) {
      addChatMember(msg.chat.id, msg.from);
      addRecentActiveUser(msg.chat.id, msg.from);
      await initUser(msg.from);
      await saveSeenUser(msg.chat.id, msg.from);
    }

    if (Array.isArray(msg.new_chat_members)) {
      for (const member of msg.new_chat_members) {
        if (!member.is_bot) {
          addChatMember(msg.chat.id, member);
          addRecentActiveUser(msg.chat.id, member);
          await initUser(member);
          await saveSeenUser(msg.chat.id, member);
        }
      }
    }
  } catch (error) {
    console.error("Ошибка сохранения участников чата:", error);
  }
});

// =========================
// PAYMENTS
// =========================
bot.on("message", async (msg) => {
  try {
    if (!msg.successful_payment || !msg.from) return;

    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const payment = msg.successful_payment;
    const purchase = await processStarPurchase(msg.from.id, payment);

    if (purchase.alreadyProcessed) {
      await safeSendMessage(
        msg.chat.id,
        `ℹ️ Оплата уже обработана.\n\nБаланс: ${purchase.balance} монет`
      );
      return;
    }

    await safeSendMessage(
      msg.chat.id,
      `✅ Оплата прошла успешно!

💰 Вам начислено ${purchase.coinsAdded} монет
Баланс: ${purchase.balance} монет`
    );
  } catch (error) {
    console.error("Ошибка successful_payment:", error);
  }
});

bot.on("callback_query", async (query) => {
  try {
    if (!query.data || !query.message || !query.from) return;

    if (query.data === "buy_50_coins") {
      await initUser(query.from);
      await saveSeenUser(query.message.chat.id, query.from);

      await bot.answerCallbackQuery(query.id);

      await bot.sendInvoice(
        query.message.chat.id,
        "50 монет",
        "Покупка 50 монет за 5 Telegram Stars",
        "coins_50",
        "",
        "XTR",
        [{ label: "50 монет", amount: 5 }]
      );
    }
  } catch (error) {
    console.error("Ошибка callback_query:", error);
  }
});

bot.on("pre_checkout_query", async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error("Ошибка pre_checkout_query:", error);
  }
});

// =========================
// MAIN HANDLER
// =========================
bot.on("message", async (msg) => {
  try {
    if (!msg.text || !msg.from || msg.from.is_bot) return;

    addChatMember(msg.chat.id, msg.from);
    addRecentActiveUser(msg.chat.id, msg.from);
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const text = (msg.text || "").trim();
    const lowerText = normalizeText(text);

    if (lowerText.startsWith("/")) return;

    const pendingKey = getPendingKey(msg.chat.id, msg.from.id);
    if (pendingCommandCreation[pendingKey]) {
      delete pendingCommandCreation[pendingKey];

      const parsed = parseCreateCommandInput(text);

      if (!parsed) {
        await safeSendMessage(
          msg.chat.id,
          `❌ Напиши в формате:
команда действие

Пример:
облил облил водой`
        );
        return;
      }

      if (!isValidTrigger(parsed.trigger)) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Команда должна быть одним словом от 2 до 20 символов.\nМожно буквы, цифры, _ и -"
        );
        return;
      }

      if (parsed.actionText.length < 2 || parsed.actionText.length > 60) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Текст действия должен быть от 2 до 60 символов."
        );
        return;
      }

      if (rpCommands[parsed.trigger]) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Такая команда уже занята стандартной командой."
        );
        return;
      }

      const existing = await getCustomCommandByTrigger(parsed.trigger);
      if (existing) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Такая команда уже существует. Напиши другую."
        );
        return;
      }

      const count = await getUserCustomCommandCount(msg.from.id);
      if (count >= 5) {
        await safeSendMessage(
          msg.chat.id,
          "❌ У тебя уже максимум команд: 5\nУдалить можно через /deletecommand"
        );
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if ((stats.balance || 0) < 20) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Чтобы создать команду, нужно 20 монет."
        );
        return;
      }

      await pool.query(
        `UPDATE users SET balance = balance - 20 WHERE user_id = $1`,
        [msg.from.id]
      );

      await createCustomCommand(msg.from.id, parsed.trigger, parsed.actionText);

      await safeSendMessage(
        msg.chat.id,
        `✅ Команда "${escapeHtml(parsed.trigger)}" создана!

Теперь:
${escapeHtml(parsed.trigger)} — команда
${escapeHtml(parsed.actionText)} — текст бота

Списано: 20 монет`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // BOMB START
    if (isExactCommand(lowerText, "бомба")) {
      const bombKey = getBombChatKey(msg.chat.id);

      if (activeBombs[bombKey]) {
        await safeSendMessage(
          msg.chat.id,
          "💣 Бомба уже запущена. Дождись, пока она взорвётся."
        );
        return;
      }

      const candidates = getRecentActiveCandidates(msg.chat.id);
      if (candidates.length < 2) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Нужно хотя бы 2 активных человека в чате."
        );
        return;
      }

      const holder = getRandomFromArray(candidates);

      activeBombs[bombKey] = {
        holder,
        previousHolderId: null,
        timer: null
      };

      await safeSendMessage(
        msg.chat.id,
        `💣 Бомба активирована!

🔥 Бомба у: ${getUserLink(holder)}
⏳ У него 5 секунд, чтобы написать: передать`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );

      await startBombTimer(msg.chat.id);
      return;
    }

    // BOMB PASS
    if (isExactCommand(lowerText, "передать")) {
      const bombKey = getBombChatKey(msg.chat.id);
      const bomb = activeBombs[bombKey];

      if (!bomb) return;

      if (!bomb.holder || bomb.holder.id !== msg.from.id) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас бомба не у тебя.");
        return;
      }

      await passBomb(msg.chat.id, msg.from);
      return;
    }

    // SHOP
    if (isExactCommand(lowerText, "магазин")) {
      await safeSendMessage(
        msg.chat.id,
        `🛒 Магазин

Товар:
💰 50 монет — 5 ⭐`,
        { reply_markup: getShopKeyboard() }
      );
      return;
    }

    // LIE
    if (
      isExactCommand(lowerText, "он врет?") ||
      isExactCommand(lowerText, "врет?") ||
      isExactCommand(lowerText, "он врёт?") ||
      isExactCommand(lowerText, "врёт?")
    ) {
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши: он врет?"
        );
        return;
      }

      const result = getLieResult();

      await safeSendMessage(
        msg.chat.id,
        `🕵️ ${getUserLink(target)} проверен...\n\nВероятность лжи: ${result.percent}%\n${escapeHtml(result.text)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // RESPECT
    if (isExactCommand(lowerText, "респект")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши: респект"
        );
        return;
      }

      await initUser(target);
      await saveSeenUser(msg.chat.id, target);

      if (sender.id === target.id) {
        await safeSendMessage(msg.chat.id, "Себе респект дать нельзя 😅");
        return;
      }

      const result = await pool.query(
        `UPDATE users SET respect = COALESCE(respect, 0) + 1 WHERE user_id = $1 RETURNING respect`,
        [target.id]
      );

      const respectCount = result.rows[0]?.respect || 0;

      await safeSendMessage(
        msg.chat.id,
        `🤝 ${getUserLink(sender)} выразил респект ${getUserLink(target)}\n\nРеспект: ${respectCount}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // PAIR
    if (isExactCommand(lowerText, "пара")) {
      const pair = await getRandomPairMembersFromDb(msg.chat.id);

      if (!pair) {
        await safeSendMessage(
          msg.chat.id,
          "Нужно хотя бы 2 человека, которых бот уже видел в этом чате 💞"
        );
        return;
      }

      const [firstUser, secondUser] = pair;
      const percent = Math.floor(Math.random() * 101);

      await safeSendMessage(
        msg.chat.id,
        `💞 Случайная пара:\n${getUserLink(firstUser)} + ${getUserLink(secondUser)}\n\n❤️ Совместимость: ${percent}%`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // MONEY
    if (isExactCommand(lowerText, "деньги") || isExactCommand(lowerText, "монеты")) {
      const result = await claimDailyCoins(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, получить монеты снова можно через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `💰 ${getUserLink(msg.from)}, вы получили ${result.coins} монет!\n\nБаланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // HUNT
    if (isExactCommand(lowerText, "охота")) {
      const result = await runHunt(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
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
      if (result.hunt.coins > 0) coinsLine = `💰 +${result.hunt.coins} монет`;
      else if (result.hunt.coins < 0) coinsLine = `💀 ${result.hunt.coins} монет`;

      await safeSendMessage(
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

    // SNIPER
    if (isExactCommand(lowerText, "снайпер")) {
      const result = await runSniper(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
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
      if (result.sniper.coins > 0) coinsLine = `💰 +${result.sniper.coins} монет`;

      await safeSendMessage(
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

    // PREDICTION
    if (isExactCommand(lowerText, "прогноз")) {
      const prediction = getRandomPrediction();

      await safeSendMessage(
        msg.chat.id,
        `🔮 ${getUserLink(msg.from)}\n${escapeHtml(prediction)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // RATING
    if (lowerText.startsWith("оценка")) {
      let target = null;

      if (msg.reply_to_message && msg.reply_to_message.from) {
        target = msg.reply_to_message.from;
      } else {
        const parts = text.split(" ");
        if (parts.length > 1) {
          target = { first_name: parts.slice(1).join(" ") };
        } else {
          target = msg.from;
        }
      }

      const rating = getRandomRating();

      await safeSendMessage(
        msg.chat.id,
        `📊 Оценка ${escapeHtml(getUserName(target))}: ${rating}/10 😎`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // WHO
    if (lowerText.startsWith("кто ")) {
      const subject = text.slice(4).trim();

      if (!subject) {
        await safeSendMessage(msg.chat.id, "Напиши, например: кто лучший");
        return;
      }

      const randomUser = getRandomChatMember(msg.chat.id);

      if (!randomUser) {
        await safeSendMessage(msg.chat.id, "Пока некого выбрать 🤔");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🤔 ${escapeHtml(subject)}? Думаю это ${getUserLink(randomUser)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // GIFT
    if (isExactCommand(lowerText, "подарок")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(
          msg.chat.id,
          "Ответь на сообщение человека и напиши: подарок"
        );
        return;
      }

      await initUser(target);
      await saveSeenUser(msg.chat.id, target);

      if (sender.id === target.id) {
        await safeSendMessage(
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

      await safeSendMessage(
        msg.chat.id,
        `🎁 ${getUserLink(sender)} подарил(а) ${getUserLink(target)} ${escapeHtml(gift)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // CUSTOM COMMANDS
    const customCommand = await getCustomCommandByTrigger(lowerText);
    if (customCommand) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(
          msg.chat.id,
          "Ответь на сообщение человека этой командой."
        );
        return;
      }

      await initUser(target);
      await saveSeenUser(msg.chat.id, target);

      if (sender.id === target.id) {
        await safeSendMessage(
          msg.chat.id,
          `😅 ${getUserLink(sender)} ${escapeHtml(customCommand.action_text)} самого себя`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `💬 ${getUserLink(sender)} ${escapeHtml(customCommand.action_text)} ${getUserLink(target)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // STANDARD RP COMMANDS
    const command = rpCommands[lowerText];
    if (!command) return;

    const sender = msg.from;
    const target = await resolveTargetUserFromReply(msg);

    if (!target) {
      await safeSendMessage(msg.chat.id, "Ответь на сообщение человека этой командой.");
      return;
    }

    await initUser(target);
    await saveSeenUser(msg.chat.id, target);

    if (sender.id === target.id) {
      await safeSendMessage(
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

    await safeSendMessage(
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
// STARTUP
// =========================
(async () => {
  try {
    const test = await pool.query("SELECT NOW()");
    console.log("✅ DB connected:", test.rows[0]);

    await initDb();
    console.log("✅ Bot started");
  } catch (error) {
    console.error("❌ Ошибка запуска:", error);
  }
})();
