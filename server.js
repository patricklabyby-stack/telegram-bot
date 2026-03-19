const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const crypto = require("crypto");

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
const recentActiveUsers = {};
const activeBombs = {};
const pendingCommandCreation = {};

const pendingMarriagesByRequestId = {};
const pendingMarriagesByUserKey = {};
const pendingAdoptionsByRequestId = {};
const pendingAdoptionsByUserKey = {};

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const BOMB_TIMER_MS = 5000;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const MARRIAGE_REQUEST_MS = 10 * 60 * 1000;
const ADOPTION_REQUEST_MS = 10 * 60 * 1000;
const MAX_CUSTOM_COMMANDS = 5;
const CUSTOM_COMMAND_COST = 20;
const MAX_CHILDREN_PER_FAMILY = 3;

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

function generateRequestId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
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

async function safeAnswerCallback(query, text = "", showAlert = false) {
  try {
    await bot.answerCallbackQuery(query.id, { text, show_alert: showAlert });
  } catch (error) {
    console.error("Ошибка answerCallbackQuery:", error?.message || error);
  }
}

async function removeInlineKeyboard(chatId, messageId) {
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: messageId }
    );
  } catch (error) {
    console.error("Не удалось убрать кнопки:", error?.message || error);
  }
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(1, Math.ceil((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  if (minutes > 0) return seconds > 0 ? `${minutes} мин ${seconds} сек` : `${minutes} мин`;
  return `${seconds} сек`;
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
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

  if (Math.random() < 0.25) {
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
  if (Math.random() < 0.5) {
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
      [{ text: "💰 50 монет — 5 ⭐", callback_data: "buy_50_coins" }]
    ]
  };
}

function getMarriageDecisionKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Да", callback_data: `marriage_yes:${requestId}` },
        { text: "❌ Нет", callback_data: `marriage_no:${requestId}` }
      ]
    ]
  };
}

function getAdoptionDecisionKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Да", callback_data: `adoption_yes:${requestId}` },
        { text: "❌ Нет", callback_data: `adoption_no:${requestId}` }
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

function isRequestExpired(createdAt, ttlMs) {
  return Date.now() - createdAt > ttlMs;
}

// =========================
// CLEANUP
// =========================
function cleanupPendingRequests() {
  for (const requestId of Object.keys(pendingMarriagesByRequestId)) {
    const req = pendingMarriagesByRequestId[requestId];
    if (!req || isRequestExpired(req.createdAt, MARRIAGE_REQUEST_MS)) {
      if (req?.userKey) delete pendingMarriagesByUserKey[req.userKey];
      delete pendingMarriagesByRequestId[requestId];
    }
  }

  for (const requestId of Object.keys(pendingAdoptionsByRequestId)) {
    const req = pendingAdoptionsByRequestId[requestId];
    if (!req || isRequestExpired(req.createdAt, ADOPTION_REQUEST_MS)) {
      if (req?.userKey) delete pendingAdoptionsByUserKey[req.userKey];
      delete pendingAdoptionsByRequestId[requestId];
    }
  }
}

setInterval(cleanupPendingRequests, 60 * 1000);

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

  return users.filter((user) => {
    if (!user || !user.id) return false;
    if (excludeUserIds.includes(user.id)) return false;
    return now - (user.last_seen_at || 0) <= ACTIVE_WINDOW_MS;
  });
}

function clearBomb(chatId) {
  const key = getBombChatKey(chatId);
  if (activeBombs[key]?.timer) clearTimeout(activeBombs[key].timer);
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

  if (bomb.timer) clearTimeout(bomb.timer);

  bomb.timer = setTimeout(async () => {
    try {
      await explodeBomb(chatId);
    } catch (error) {
      console.error("Ошибка взрыва бомбы:", error);
    }
  }, BOMB_TIMER_MS);
}

async function passBomb(chatId, fromUser) {
  const key = getBombChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return false;

  const excludeIds = [fromUser.id];
  if (bomb.previousHolderId) excludeIds.push(bomb.previousHolderId);

  let candidates = getRecentActiveCandidates(chatId, excludeIds);
  if (!candidates.length) candidates = getRecentActiveCandidates(chatId, [fromUser.id]);

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
      saves INTEGER DEFAULT 0,
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marriages (
      id SERIAL PRIMARY KEY,
      user1_id BIGINT NOT NULL,
      user2_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS adoptions (
      id SERIAL PRIMARY KEY,
      parent_user_id BIGINT NOT NULL,
      child_user_id BIGINT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorite_children (
      parent_user_id BIGINT PRIMARY KEY,
      child_user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0`);

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
      first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE users.first_name END,
      last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE users.last_name END,
      username = CASE WHEN EXCLUDED.username <> '' THEN EXCLUDED.username ELSE users.username END
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
      first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE chat_seen_users.first_name END,
      last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE chat_seen_users.last_name END,
      username = CASE WHEN EXCLUDED.username <> '' THEN EXCLUDED.username ELSE chat_seen_users.username END
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
  const result = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
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
    "kills", "hugs", "kisses", "hits", "bites", "pats", "kicks", "slaps",
    "punches", "licks", "steals", "scams", "destroys", "wakes", "freezes",
    "saves"
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

async function transferCoins(fromUserId, toUserId, amount) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const fromResult = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [fromUserId]
    );
    const toResult = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [toUserId]
    );

    if (!fromResult.rows[0] || !toResult.rows[0]) {
      throw new Error("USER_NOT_FOUND");
    }

    const fromBalance = Number(fromResult.rows[0].balance || 0);
    if (fromBalance < amount) {
      throw new Error("NOT_ENOUGH_MONEY");
    }

    const updatedFrom = await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1 RETURNING balance`,
      [fromUserId, amount]
    );

    const updatedTo = await client.query(
      `UPDATE users SET balance = balance + $2 WHERE user_id = $1 RETURNING balance`,
      [toUserId, amount]
    );

    await client.query("COMMIT");

    return {
      fromBalance: Number(updatedFrom.rows[0].balance || 0),
      toBalance: Number(updatedTo.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processStarPurchase(userId, successfulPayment) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT telegram_payment_charge_id FROM star_purchases WHERE telegram_payment_charge_id = $1`,
      [successfulPayment.telegram_payment_charge_id]
    );

    if (existing.rows.length > 0) {
      const balanceRow = await client.query(`SELECT balance FROM users WHERE user_id = $1`, [userId]);
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
      ) VALUES ($1, $2, $3, $4, $5)
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
      `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE user_id = $1 RETURNING balance`,
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
// MARRIAGE
// =========================
async function getActiveMarriageByUserId(userId) {
  const result = await pool.query(
    `
    SELECT *
    FROM marriages
    WHERE is_active = TRUE
      AND (user1_id = $1 OR user2_id = $1)
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function isUserMarried(userId) {
  return !!(await getActiveMarriageByUserId(userId));
}

async function createMarriage(user1Id, user2Id) {
  const smaller = Math.min(Number(user1Id), Number(user2Id));
  const bigger = Math.max(Number(user1Id), Number(user2Id));

  const result = await pool.query(
    `
    INSERT INTO marriages (user1_id, user2_id, is_active)
    VALUES ($1, $2, TRUE)
    RETURNING *
    `,
    [smaller, bigger]
  );

  return result.rows[0];
}

async function divorceMarriageByUserId(userId) {
  const result = await pool.query(
    `
    UPDATE marriages
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND (user1_id = $1 OR user2_id = $1)
    RETURNING *
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getMarriagePartner(userId) {
  const marriage = await getActiveMarriageByUserId(userId);
  if (!marriage) return null;

  const partnerId =
    Number(marriage.user1_id) === Number(userId)
      ? Number(marriage.user2_id)
      : Number(marriage.user1_id);

  return { marriage, partnerId };
}

async function isSpouse(userId, targetUserId) {
  const marriage = await getActiveMarriageByUserId(userId);
  if (!marriage) return false;

  return (
    Number(marriage.user1_id) === Number(targetUserId) ||
    Number(marriage.user2_id) === Number(targetUserId)
  );
}

// =========================
// ADOPTIONS / FAMILY
// =========================
async function getActiveAdoptionByChildId(childUserId) {
  const result = await pool.query(
    `
    SELECT *
    FROM adoptions
    WHERE child_user_id = $1
      AND is_active = TRUE
    LIMIT 1
    `,
    [childUserId]
  );

  return result.rows[0] || null;
}

async function getChildrenByParentIds(parentIds) {
  if (!parentIds.length) return [];

  const result = await pool.query(
    `
    SELECT *
    FROM adoptions
    WHERE is_active = TRUE
      AND parent_user_id = ANY($1::bigint[])
    ORDER BY created_at ASC
    `,
    [parentIds]
  );

  return result.rows;
}

async function getFamilyParentIds(userId) {
  const marriagePartner = await getMarriagePartner(userId);
  if (!marriagePartner) return [Number(userId)];
  return [Number(userId), Number(marriagePartner.partnerId)];
}

async function getFamilyChildrenCount(userId) {
  const parentIds = await getFamilyParentIds(userId);
  const children = await getChildrenByParentIds(parentIds);
  return children.length;
}

async function createAdoption(parentUserId, childUserId) {
  const existingActive = await getActiveAdoptionByChildId(childUserId);
  if (existingActive) return { ok: false, reason: "already_adopted" };

  const familyParentIds = await getFamilyParentIds(parentUserId);
  const mainParentId = Number(familyParentIds[0]);

  const existingAny = await pool.query(
    `SELECT * FROM adoptions WHERE child_user_id = $1 LIMIT 1`,
    [childUserId]
  );

  if (existingAny.rows[0]) {
    const updated = await pool.query(
      `
      UPDATE adoptions
      SET parent_user_id = $1,
          is_active = TRUE,
          created_at = NOW()
      WHERE child_user_id = $2
      RETURNING *
      `,
      [mainParentId, childUserId]
    );

    return { ok: true, adoption: updated.rows[0] };
  }

  const inserted = await pool.query(
    `
    INSERT INTO adoptions (parent_user_id, child_user_id, is_active)
    VALUES ($1, $2, TRUE)
    RETURNING *
    `,
    [mainParentId, childUserId]
  );

  return { ok: true, adoption: inserted.rows[0] };
}

async function removeChildFromParent(parentUserId, childUserId) {
  const parentIds = await getFamilyParentIds(parentUserId);

  const result = await pool.query(
    `
    UPDATE adoptions
    SET is_active = FALSE
    WHERE parent_user_id = ANY($1::bigint[])
      AND child_user_id = $2
      AND is_active = TRUE
    RETURNING *
    `,
    [parentIds, childUserId]
  );

  for (const pid of parentIds) {
    await removeFavoriteIfMatches(Number(pid), childUserId);
  }

  return result.rows[0] || null;
}

async function childEscapeFamily(childUserId) {
  const existing = await getActiveAdoptionByChildId(childUserId);

  const result = await pool.query(
    `
    UPDATE adoptions
    SET is_active = FALSE
    WHERE child_user_id = $1
      AND is_active = TRUE
    RETURNING *
    `,
    [childUserId]
  );

  if (existing?.parent_user_id) {
    const parentIds = await getFamilyParentIds(Number(existing.parent_user_id));
    for (const pid of parentIds) {
      await removeFavoriteIfMatches(Number(pid), childUserId);
    }
  }

  return result.rows[0] || null;
}

async function isChildInMyFamily(parentUserId, childUserId) {
  const parentIds = await getFamilyParentIds(parentUserId);

  const result = await pool.query(
    `
    SELECT *
    FROM adoptions
    WHERE parent_user_id = ANY($1::bigint[])
      AND child_user_id = $2
      AND is_active = TRUE
    LIMIT 1
    `,
    [parentIds, childUserId]
  );

  return !!result.rows[0];
}

async function setFavoriteChild(parentUserId, childUserId) {
  const result = await pool.query(
    `
    INSERT INTO favorite_children (parent_user_id, child_user_id)
    VALUES ($1, $2)
    ON CONFLICT (parent_user_id)
    DO UPDATE SET
      child_user_id = EXCLUDED.child_user_id,
      created_at = NOW()
    RETURNING *
    `,
    [parentUserId, childUserId]
  );

  return result.rows[0] || null;
}

async function removeFavoriteChild(parentUserId) {
  const result = await pool.query(
    `
    DELETE FROM favorite_children
    WHERE parent_user_id = $1
    RETURNING *
    `,
    [parentUserId]
  );

  return result.rows[0] || null;
}

async function getFavoriteChild(parentUserId) {
  const result = await pool.query(
    `
    SELECT *
    FROM favorite_children
    WHERE parent_user_id = $1
    LIMIT 1
    `,
    [parentUserId]
  );

  return result.rows[0] || null;
}

async function removeFavoriteIfMatches(parentUserId, childUserId) {
  await pool.query(
    `DELETE FROM favorite_children WHERE parent_user_id = $1 AND child_user_id = $2`,
    [parentUserId, childUserId]
  );
}

async function isUserChild(userId) {
  return !!(await getActiveAdoptionByChildId(userId));
}

async function canAdoptUser(parentUserId, targetUserId) {
  if (Number(parentUserId) === Number(targetUserId)) {
    return { ok: false, reason: "self", text: "❌ Нельзя усыновить самого себя." };
  }

  const parentMarriage = await getMarriagePartner(parentUserId);
  if (!parentMarriage) {
    return { ok: false, reason: "not_married", text: "❌ Усыновлять ребёнка могут только люди в браке." };
  }

  const parentIsChild = await isUserChild(parentUserId);
  if (parentIsChild) {
    return { ok: false, reason: "parent_is_child", text: "❌ Ребёнок не может усыновлять других игроков." };
  }

  const targetIsSpouse = await isSpouse(parentUserId, targetUserId);
  if (targetIsSpouse) {
    return { ok: false, reason: "spouse", text: "❌ Нельзя усыновить своего супруга(у)." };
  }

  const targetMarriage = await getMarriagePartner(targetUserId);
  if (targetMarriage) {
    return { ok: false, reason: "target_married", text: "❌ Нельзя усыновить игрока, который состоит в браке." };
  }

  const activeAdoption = await getActiveAdoptionByChildId(targetUserId);
  if (activeAdoption) {
    return {
      ok: false,
      reason: "already_adopted",
      text: "❌ Этот ребёнок уже усыновлён. Выбери другого ребёнка."
    };
  }

  const childrenCount = await getFamilyChildrenCount(parentUserId);
  if (childrenCount >= MAX_CHILDREN_PER_FAMILY) {
    return {
      ok: false,
      reason: "family_limit",
      text: `❌ В семье уже максимум ${MAX_CHILDREN_PER_FAMILY} ребёнка(детей).`
    };
  }

  return { ok: true };
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
    `INSERT INTO custom_commands (user_id, trigger, action_text) VALUES ($1, $2, $3)`,
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
  const result = await pool.query(`SELECT balance, last_daily_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastDailyAt = row.last_daily_at ? new Date(row.last_daily_at) : null;

  if (lastDailyAt) {
    const nextTime = new Date(lastDailyAt.getTime() + DAILY_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
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

  return { ok: true, coins, balance: updateResult.rows[0].balance };
}

async function runHunt(userId) {
  const result = await pool.query(`SELECT balance, last_hunt_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastHuntAt = row.last_hunt_at ? new Date(row.last_hunt_at) : null;

  if (lastHuntAt) {
    const nextTime = new Date(lastHuntAt.getTime() + DAILY_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
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

  return { ok: true, hunt, balance: updateResult.rows[0].balance };
}

async function runSniper(userId) {
  const result = await pool.query(`SELECT balance, last_sniper_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastSniperAt = row.last_sniper_at ? new Date(row.last_sniper_at) : null;

  if (lastSniperAt) {
    const nextTime = new Date(lastSniperAt.getTime() + DAILY_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
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

  return { ok: true, sniper, balance: updateResult.rows[0].balance };
}

async function getCooldownText(userId) {
  const stats = await getUserStats(userId);
  if (!stats) return "Профиль не найден.";

  const now = new Date();

  function getRemaining(lastAt) {
    if (!lastAt) return "✅ Уже доступно";

    const nextTime = new Date(new Date(lastAt).getTime() + DAILY_COOLDOWN_MS);
    const diff = nextTime.getTime() - now.getTime();

    if (diff <= 0) return "✅ Уже доступно";
    return `⏳ ${formatRemainingTime(diff)}`;
  }

  return `⏱ Кулдауны

💰 Деньги: ${getRemaining(stats.last_daily_at)}
🏹 Охота: ${getRemaining(stats.last_hunt_at)}
🎯 Снайпер: ${getRemaining(stats.last_sniper_at)}`;
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
🛡️ Спасли: ${stats.saves}

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

  if (replyMsg.from && !replyMsg.from.is_bot && replyMsg.from.id) {
    await initUser(replyMsg.from);
    await saveSeenUser(msg.chat.id, replyMsg.from);

    return {
      id: Number(replyMsg.from.id),
      first_name: replyMsg.from.first_name || "",
      last_name: replyMsg.from.last_name || "",
      username: replyMsg.from.username || ""
    };
  }

  const profileOwnerId = await getProfileOwnerByMessageId(replyMsg.message_id);
  if (profileOwnerId) {
    const storedUser = await getStoredUser(profileOwnerId);
    if (storedUser) return storedUser;
  }

  return null;
}

// =========================
// REQUEST HELPERS
// =========================
function saveMarriageRequest(request) {
  pendingMarriagesByRequestId[request.requestId] = request;
  pendingMarriagesByUserKey[request.userKey] = request.requestId;
}

function deleteMarriageRequest(request) {
  if (!request) return;
  delete pendingMarriagesByRequestId[request.requestId];
  delete pendingMarriagesByUserKey[request.userKey];
}

function findMarriageRequestByUser(chatId, userId) {
  const requestId = pendingMarriagesByUserKey[`${chatId}:${userId}`];
  if (!requestId) return null;
  return pendingMarriagesByRequestId[requestId] || null;
}

function saveAdoptionRequest(request) {
  pendingAdoptionsByRequestId[request.requestId] = request;
  pendingAdoptionsByUserKey[request.userKey] = request.requestId;
}

function deleteAdoptionRequest(request) {
  if (!request) return;
  delete pendingAdoptionsByRequestId[request.requestId];
  delete pendingAdoptionsByUserKey[request.userKey];
}

function findAdoptionRequestByUser(chatId, userId) {
  const requestId = pendingAdoptionsByUserKey[`${chatId}:${userId}`];
  if (!requestId) return null;
  return pendingAdoptionsByRequestId[requestId] || null;
}

async function finalizeMarriageAccept(request, chatId, messageId = null) {
  if (!request) return;

  if (isRequestExpired(request.createdAt, MARRIAGE_REQUEST_MS)) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteMarriageRequest(request);
    await safeSendMessage(chatId, "⌛ Предложение брака устарело.");
    return;
  }

  const senderMarried = await isUserMarried(request.fromUser.id);
  const targetMarried = await isUserMarried(request.targetUser.id);

  if (senderMarried || targetMarried) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteMarriageRequest(request);
    await safeSendMessage(chatId, "❌ Кто-то из вас уже состоит в браке.");
    return;
  }

  const senderChildRole = await getActiveAdoptionByChildId(request.fromUser.id);
  const targetChildRole = await getActiveAdoptionByChildId(request.targetUser.id);

  if (senderChildRole || targetChildRole) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteMarriageRequest(request);
    await safeSendMessage(chatId, "❌ Игрок в роли ребёнка не может вступить в брак.");
    return;
  }

  const marriage = await createMarriage(request.fromUser.id, request.targetUser.id);

  if (messageId) await removeInlineKeyboard(chatId, messageId);
  deleteMarriageRequest(request);

  await safeSendMessage(
    chatId,
    `💍 Брак зарегистрирован!

${getUserLink(request.fromUser)} + ${getUserLink(request.targetUser)}

📅 Дата: ${formatDate(marriage.created_at)}
🏡 Теперь вы семья!`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
}

async function finalizeMarriageDecline(request, chatId, messageId = null) {
  if (!request) return;

  if (messageId) await removeInlineKeyboard(chatId, messageId);

  await safeSendMessage(
    chatId,
    `💔 ${getUserLink(request.targetUser)} отказал(а) ${getUserLink(request.fromUser)} в браке.`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  deleteMarriageRequest(request);
}

async function finalizeAdoptionAccept(request, chatId, messageId = null) {
  if (!request) return;

  if (isRequestExpired(request.createdAt, ADOPTION_REQUEST_MS)) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteAdoptionRequest(request);
    await safeSendMessage(chatId, "⌛ Предложение усыновления устарело.");
    return;
  }

  const validation = await canAdoptUser(request.parentUser.id, request.childUser.id);

  if (!validation.ok) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteAdoptionRequest(request);
    await safeSendMessage(chatId, validation.text);
    return;
  }

  let creation;
  try {
    creation = await createAdoption(request.parentUser.id, request.childUser.id);
  } catch (error) {
    console.error("Ошибка createAdoption:", error);
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteAdoptionRequest(request);
    await safeSendMessage(chatId, "❌ Ошибка усыновления. Попробуй ещё раз.");
    return;
  }

  if (!creation.ok) {
    if (messageId) await removeInlineKeyboard(chatId, messageId);
    deleteAdoptionRequest(request);
    await safeSendMessage(chatId, "❌ Этот ребёнок уже усыновлён. Выбери другого ребёнка.");
    return;
  }

  if (messageId) await removeInlineKeyboard(chatId, messageId);

  const spouseInfo = await getMarriagePartner(request.parentUser.id);
  const spouseUser = spouseInfo ? await getStoredUser(spouseInfo.partnerId) : null;

  let successText = `👶 Усыновление прошло успешно!

${getUserLink(request.parentUser)} теперь родитель для ${getUserLink(request.childUser)}`;

  if (spouseUser) {
    successText += `\n💍 Второй родитель: ${getUserLink(spouseUser)}`;
  }

  successText += `\n📅 Дата: ${formatDate(creation.adoption.created_at)}`;

  deleteAdoptionRequest(request);

  await safeSendMessage(chatId, successText, {
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function finalizeAdoptionDecline(request, chatId, messageId = null) {
  if (!request) return;

  if (messageId) await removeInlineKeyboard(chatId, messageId);

  await safeSendMessage(
    chatId,
    `❌ ${getUserLink(request.childUser)} отказал(а) ${getUserLink(request.parentUser)} в усыновлении.`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  deleteAdoptionRequest(request);
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
  "заморозить": { text: "заморозил", stat: "freezes", emoji: "🧊" },
  "спасти": { text: "спас", stat: "saves", emoji: "🛡️" }
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
спасти
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
брак
зарегистрироваться в брак
развод
семья
усыновить
отказаться от ребенка
сбежать из семьи
любимый ребенок
убрать любимого ребенка
карманные деньги 50
он врет?
врет?
/createcommand
/mycommands
/deletecommand
/balance
/cooldowns

/profile — показать свой профиль
/profile ответом — показать профиль игрока`
  );
});

bot.onText(/^\/profile(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    let targetUser = null;

    if (msg.reply_to_message) {
      targetUser = await resolveTargetUserFromReply(msg);
    }

    if (!targetUser) targetUser = msg.from;

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

bot.onText(/^\/cooldowns(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const text = await getCooldownText(msg.from.id);
    await safeSendMessage(msg.chat.id, text);
  } catch (error) {
    console.error("Ошибка /cooldowns:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении кулдаунов.");
  }
});

bot.onText(/^\/createcommand(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    await initUser(msg.from);
    await saveSeenUser(msg.chat.id, msg.from);

    const count = await getUserCustomCommandCount(msg.from.id);
    if (count >= MAX_CUSTOM_COMMANDS) {
      await safeSendMessage(
        msg.chat.id,
        `❌ У тебя уже максимум команд: ${MAX_CUSTOM_COMMANDS}\nУдалить можно через /deletecommand`
      );
      return;
    }

    const stats = await getUserStats(msg.from.id);
    if ((stats.balance || 0) < CUSTOM_COMMAND_COST) {
      await safeSendMessage(
        msg.chat.id,
        `❌ Чтобы создать команду, нужно ${CUSTOM_COMMAND_COST} монет.`
      );
      return;
    }

    const key = getPendingKey(msg.chat.id, msg.from.id);
    pendingCommandCreation[key] = true;

    await safeSendMessage(
      msg.chat.id,
      `🛠 Создание команды

Цена: ${CUSTOM_COMMAND_COST} монет
Максимум: ${MAX_CUSTOM_COMMANDS} команд

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

    const purchase = await processStarPurchase(msg.from.id, msg.successful_payment);

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

// =========================
// CALLBACKS
// =========================
bot.on("callback_query", async (query) => {
  try {
    if (!query.data || !query.message || !query.from) return;

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = String(query.data);

    if (data === "buy_50_coins") {
      await safeAnswerCallback(query);
      await initUser(query.from);
      await saveSeenUser(chatId, query.from);

      await bot.sendInvoice(
        chatId,
        "50 монет",
        "Покупка 50 монет за 5 Telegram Stars",
        "coins_50",
        "",
        "XTR",
        [{ label: "50 монет", amount: 5 }]
      );
      return;
    }

    if (data.startsWith("marriage_yes:") || data.startsWith("marriage_no:")) {
      const [action, requestId] = data.split(":");
      const request = pendingMarriagesByRequestId[requestId];

      if (!request) {
        await safeAnswerCallback(query, "⌛ Эта заявка уже недействительна.", true);
        await removeInlineKeyboard(chatId, messageId);
        return;
      }

      if (Number(query.from.id) !== Number(request.targetUser.id)) {
        await safeAnswerCallback(query, "❌ Это не твоя кнопка.", true);
        return;
      }

      await safeAnswerCallback(query, "✅ Ответ принят");

      if (action === "marriage_no") {
        await finalizeMarriageDecline(request, chatId, messageId);
        return;
      }

      await finalizeMarriageAccept(request, chatId, messageId);
      return;
    }

    if (data.startsWith("adoption_yes:") || data.startsWith("adoption_no:")) {
      const [action, requestId] = data.split(":");
      const request = pendingAdoptionsByRequestId[requestId];

      if (!request) {
        await safeAnswerCallback(query, "⌛ Эта заявка уже недействительна.", true);
        await removeInlineKeyboard(chatId, messageId);
        return;
      }

      if (Number(query.from.id) !== Number(request.childUser.id)) {
        await safeAnswerCallback(query, "❌ Это не твоя кнопка.", true);
        return;
      }

      await safeAnswerCallback(query, "✅ Ответ принят");

      if (action === "adoption_no") {
        await finalizeAdoptionDecline(request, chatId, messageId);
        return;
      }

      await finalizeAdoptionAccept(request, chatId, messageId);
      return;
    }

    await safeAnswerCallback(query);
  } catch (error) {
    console.error("Ошибка callback_query:", error);
    await safeAnswerCallback(query, "❌ Ошибка кнопки.", true);
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
        await safeSendMessage(msg.chat.id, "❌ Текст действия должен быть от 2 до 60 символов.");
        return;
      }

      if (rpCommands[parsed.trigger]) {
        await safeSendMessage(msg.chat.id, "❌ Такая команда уже занята стандартной командой.");
        return;
      }

      const existing = await getCustomCommandByTrigger(parsed.trigger);
      if (existing) {
        await safeSendMessage(msg.chat.id, "❌ Такая команда уже существует. Напиши другую.");
        return;
      }

      const count = await getUserCustomCommandCount(msg.from.id);
      if (count >= MAX_CUSTOM_COMMANDS) {
        await safeSendMessage(
          msg.chat.id,
          `❌ У тебя уже максимум команд: ${MAX_CUSTOM_COMMANDS}\nУдалить можно через /deletecommand`
        );
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if ((stats.balance || 0) < CUSTOM_COMMAND_COST) {
        await safeSendMessage(msg.chat.id, `❌ Чтобы создать команду, нужно ${CUSTOM_COMMAND_COST} монет.`);
        return;
      }

      await pool.query(`UPDATE users SET balance = balance - $2 WHERE user_id = $1`, [
        msg.from.id,
        CUSTOM_COMMAND_COST
      ]);

      await createCustomCommand(msg.from.id, parsed.trigger, parsed.actionText);

      await safeSendMessage(
        msg.chat.id,
        `✅ Команда "${escapeHtml(parsed.trigger)}" создана!

Теперь:
${escapeHtml(parsed.trigger)} — команда
${escapeHtml(parsed.actionText)} — текст бота

Списано: ${CUSTOM_COMMAND_COST} монет`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const pendingMarriage = findMarriageRequestByUser(msg.chat.id, msg.from.id);
    if (pendingMarriage && (isExactCommand(lowerText, "да") || isExactCommand(lowerText, "нет"))) {
      if (isExactCommand(lowerText, "нет")) {
        await finalizeMarriageDecline(pendingMarriage, msg.chat.id);
        return;
      }

      await finalizeMarriageAccept(pendingMarriage, msg.chat.id);
      return;
    }

    const pendingAdoption = findAdoptionRequestByUser(msg.chat.id, msg.from.id);
    if (pendingAdoption && (isExactCommand(lowerText, "да") || isExactCommand(lowerText, "нет"))) {
      if (isExactCommand(lowerText, "нет")) {
        await finalizeAdoptionDecline(pendingAdoption, msg.chat.id);
        return;
      }

      await finalizeAdoptionAccept(pendingAdoption, msg.chat.id);
      return;
    }

    if (isExactCommand(lowerText, "бомба")) {
      const bombKey = getBombChatKey(msg.chat.id);

      if (activeBombs[bombKey]) {
        await safeSendMessage(msg.chat.id, "💣 Бомба уже запущена. Дождись, пока она взорвётся.");
        return;
      }

      const candidates = getRecentActiveCandidates(msg.chat.id);
      if (candidates.length < 2) {
        await safeSendMessage(msg.chat.id, "❌ Нужно хотя бы 2 активных человека в чате.");
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

    if (isExactCommand(lowerText, "брак") || isExactCommand(lowerText, "зарегистрироваться в брак")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека и напиши: брак");
        return;
      }

      await initUser(target);
      await saveSeenUser(msg.chat.id, target);

      if (sender.id === target.id) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя зарегистрироваться в брак с самим собой.");
        return;
      }

      const senderMarriage = await isUserMarried(sender.id);
      if (senderMarriage) {
        await safeSendMessage(msg.chat.id, "❌ Ты уже состоишь в браке.");
        return;
      }

      const targetMarriage = await isUserMarried(target.id);
      if (targetMarriage) {
        await safeSendMessage(msg.chat.id, "❌ Этот человек уже состоит в браке.");
        return;
      }

      const senderAdoption = await getActiveAdoptionByChildId(sender.id);
      const targetAdoption = await getActiveAdoptionByChildId(target.id);

      if (senderAdoption || targetAdoption) {
        await safeSendMessage(msg.chat.id, "❌ Игрок в роли ребёнка не может вступить в брак.");
        return;
      }

      const existingReq = findMarriageRequestByUser(msg.chat.id, target.id);
      if (existingReq) {
        await safeSendMessage(msg.chat.id, "⌛ У этого игрока уже есть активное предложение брака.");
        return;
      }

      const requestId = generateRequestId("marriage");
      const request = {
        requestId,
        userKey: `${msg.chat.id}:${target.id}`,
        fromUser: {
          id: sender.id,
          first_name: sender.first_name || "",
          last_name: sender.last_name || "",
          username: sender.username || ""
        },
        targetUser: {
          id: target.id,
          first_name: target.first_name || "",
          last_name: target.last_name || "",
          username: target.username || ""
        },
        createdAt: Date.now()
      };

      saveMarriageRequest(request);

      const sent = await safeSendMessage(
        msg.chat.id,
        `💍 ${getUserLink(sender)} сделал(а) предложение ${getUserLink(target)}!

${getUserLink(target)}, выбери ниже:
✅ Да
❌ Нет

⌛ У вас есть 10 минут.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: getMarriageDecisionKeyboard(requestId)
        }
      );

      if (sent) {
        request.requestMessageId = sent.message_id;
      }

      return;
    }

    if (isExactCommand(lowerText, "развод")) {
      const marriagePartner = await getMarriagePartner(msg.from.id);

      if (!marriagePartner) {
        await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в браке.");
        return;
      }

      const partnerUser = await getStoredUser(marriagePartner.partnerId);

      await divorceMarriageByUserId(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `💔 ${getUserLink(msg.from)} развёлся(ась) с ${getUserLink(partnerUser)}.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "усыновить")) {
      const parent = msg.from;
      const child = await resolveTargetUserFromReply(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока и напиши: усыновить");
        return;
      }

      await initUser(child);
      await saveSeenUser(msg.chat.id, child);

      const validation = await canAdoptUser(parent.id, child.id);
      if (!validation.ok) {
        await safeSendMessage(msg.chat.id, validation.text);
        return;
      }

      const existingReq = findAdoptionRequestByUser(msg.chat.id, child.id);
      if (existingReq) {
        await safeSendMessage(msg.chat.id, "⌛ У этого игрока уже есть активный запрос на усыновление.");
        return;
      }

      const requestId = generateRequestId("adoption");
      const request = {
        requestId,
        userKey: `${msg.chat.id}:${child.id}`,
        parentUser: {
          id: parent.id,
          first_name: parent.first_name || "",
          last_name: parent.last_name || "",
          username: parent.username || ""
        },
        childUser: {
          id: child.id,
          first_name: child.first_name || "",
          last_name: child.last_name || "",
          username: child.username || ""
        },
        createdAt: Date.now()
      };

      saveAdoptionRequest(request);

      const spouseInfo = await getMarriagePartner(parent.id);
      const spouseUser = spouseInfo ? await getStoredUser(spouseInfo.partnerId) : null;

      let requestText = `👶 ${getUserLink(parent)}`;
      if (spouseUser) requestText += ` и ${getUserLink(spouseUser)}`;
      requestText += ` хотят усыновить ${getUserLink(child)}!

${getUserLink(child)}, выбери ниже:
✅ Да
❌ Нет

⌛ У вас есть 10 минут.`;

      const sent = await safeSendMessage(msg.chat.id, requestText, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: getAdoptionDecisionKeyboard(requestId)
      });

      if (sent) {
        request.requestMessageId = sent.message_id;
      }

      return;
    }

    if (isExactCommand(lowerText, "отказаться от ребенка")) {
      const parent = msg.from;
      const child = await resolveTargetUserFromReply(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение ребёнка и напиши: отказаться от ребенка");
        return;
      }

      const removed = await removeChildFromParent(parent.id, child.id);

      if (!removed) {
        await safeSendMessage(msg.chat.id, "❌ Этот игрок не является твоим ребёнком.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `💔 ${getUserLink(parent)} отказался(ась) от ребёнка ${getUserLink(child)}.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "сбежать из семьи")) {
      const child = msg.from;
      const activeAdoption = await getActiveAdoptionByChildId(child.id);

      if (!activeAdoption) {
        await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в семье как ребёнок.");
        return;
      }

      const parentUser = await getStoredUser(Number(activeAdoption.parent_user_id));
      await childEscapeFamily(child.id);

      await safeSendMessage(
        msg.chat.id,
        `🏃 ${getUserLink(child)} сбежал(а) из семьи ${getUserLink(parentUser)}.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "любимый ребенок")) {
      const parent = msg.from;
      const child = await resolveTargetUserFromReply(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение своего ребёнка и напиши: любимый ребенок");
        return;
      }

      const isChild = await isChildInMyFamily(parent.id, child.id);
      if (!isChild) {
        await safeSendMessage(msg.chat.id, "❌ Любимым можно сделать только своего ребёнка.");
        return;
      }

      await setFavoriteChild(parent.id, child.id);

      await safeSendMessage(
        msg.chat.id,
        `⭐ ${getUserLink(parent)} выбрал(а) ${getUserLink(child)} любимым ребёнком!`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "убрать любимого ребенка")) {
      const removedFavorite = await removeFavoriteChild(msg.from.id);

      if (!removedFavorite) {
        await safeSendMessage(msg.chat.id, "❌ У тебя пока нет любимого ребёнка.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `⭐ ${getUserLink(msg.from)} убрал(а) любимого ребёнка.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "семья")) {
      let targetUser = msg.from;

      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const partnerInfo = await getMarriagePartner(targetUser.id);
      const childInfo = await getActiveAdoptionByChildId(targetUser.id);

      if (childInfo) {
        const parentUser = await getStoredUser(Number(childInfo.parent_user_id));
        const parentPartnerInfo = await getMarriagePartner(parentUser.id);
        const secondParent = parentPartnerInfo
          ? await getStoredUser(Number(parentPartnerInfo.partnerId))
          : null;

        let textFamily = `🏡 Семья

👶 Ребёнок: ${getUserLink(targetUser)}
👨 Родитель: ${getUserLink(parentUser)}`;

        if (secondParent) {
          textFamily += `\n👩 Второй родитель: ${getUserLink(secondParent)}`;
        }

        textFamily += `\n📅 В семье с: ${formatDate(childInfo.created_at)}`;

        await safeSendMessage(msg.chat.id, textFamily, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      const parentIds = await getFamilyParentIds(targetUser.id);
      const children = await getChildrenByParentIds(parentIds);

      if (!partnerInfo && !children.length) {
        await safeSendMessage(
          msg.chat.id,
          `${getUserLink(targetUser)} пока не состоит в семье.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      let familyText = `🏡 Семья

👤 Игрок: ${getUserLink(targetUser)}`;

      if (partnerInfo) {
        const partnerUser = await getStoredUser(partnerInfo.partnerId);
        familyText += `\n💍 Супруг(а): ${getUserLink(partnerUser)}`;
        familyText += `\n📅 Брак с: ${formatDate(partnerInfo.marriage.created_at)}`;
      }

      if (children.length) {
        const favoriteChild = await getFavoriteChild(targetUser.id);
        const favoriteChildId = favoriteChild ? Number(favoriteChild.child_user_id) : null;

        const childLines = [];
        for (const childRow of children) {
          const childUser = await getStoredUser(Number(childRow.child_user_id));
          const childId = Number(childRow.child_user_id);

          if (favoriteChildId && favoriteChildId === childId) {
            childLines.push(`⭐ ${getUserLink(childUser)} — любимый`);
          } else {
            childLines.push(`• ${getUserLink(childUser)}`);
          }
        }

        familyText += `\n\n👶 Дети:\n${childLines.join("\n")}`;
      } else {
        familyText += `\n\n👶 Дети: нет`;
      }

      await safeSendMessage(msg.chat.id, familyText, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (lowerText.startsWith("карманные деньги")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение своего ребёнка и напиши: карманные деньги 50");
        return;
      }

      const match = lowerText.match(/^карманные деньги\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму больше 0.\nПример: карманные деньги 50");
        return;
      }

      const isChild = await isChildInMyFamily(sender.id, target.id);
      if (!isChild) {
        await safeSendMessage(msg.chat.id, "❌ Ты можешь давать карманные деньги только своему ребёнку.");
        return;
      }

      try {
        const transferResult = await transferCoins(sender.id, target.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `💸 ${getUserLink(sender)} дал(а) ${getUserLink(target)} ${amount} монет

Баланс ${escapeHtml(getUserName(sender))}: ${transferResult.fromBalance}
Баланс ${escapeHtml(getUserName(target))}: ${transferResult.toBalance}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка карманных денег:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка перевода монет.");
      }

      return;
    }

    if (
      isExactCommand(lowerText, "он врет?") ||
      isExactCommand(lowerText, "врет?") ||
      isExactCommand(lowerText, "он врёт?") ||
      isExactCommand(lowerText, "врёт?")
    ) {
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека и напиши: он врет?");
        return;
      }

      const result = getLieResult();

      await safeSendMessage(
        msg.chat.id,
        `🕵️ ${getUserLink(target)} проверен...

Вероятность лжи: ${result.percent}%
${escapeHtml(result.text)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "респект")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека и напиши: респект");
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
        `🤝 ${getUserLink(sender)} выразил респект ${getUserLink(target)}

Респект: ${respectCount}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "пара")) {
      const pair = await getRandomPairMembersFromDb(msg.chat.id);

      if (!pair) {
        await safeSendMessage(msg.chat.id, "Нужно хотя бы 2 человека, которых бот уже видел в этом чате 💞");
        return;
      }

      const [firstUser, secondUser] = pair;
      const percent = Math.floor(Math.random() * 101);

      await safeSendMessage(
        msg.chat.id,
        `💞 Случайная пара:
${getUserLink(firstUser)} + ${getUserLink(secondUser)}

❤️ Совместимость: ${percent}%`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

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
        `💰 ${getUserLink(msg.from)}, вы получили ${result.coins} монет!

Баланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

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

    if (isExactCommand(lowerText, "прогноз")) {
      const prediction = getRandomPrediction();

      await safeSendMessage(
        msg.chat.id,
        `🔮 ${getUserLink(msg.from)}
${escapeHtml(prediction)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

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

    if (isExactCommand(lowerText, "подарок")) {
      const sender = msg.from;
      const target = await resolveTargetUserFromReply(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека и напиши: подарок");
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

    const customCommand = await getCustomCommandByTrigger(lowerText);
    if (customCommand) {
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
