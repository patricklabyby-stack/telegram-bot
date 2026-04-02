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

const OWNER_ID = 7837011810;

// =========================
// CONFIG
// =========================
const chatMembers = {};
const recentActiveUsers = {};
const activeBombs = {};
const activeBankHeists = {};
const activeVanHeists = {};
const pendingCommandCreation = {};

const pendingMarriagesByRequestId = {};
const pendingMarriagesByUserKey = {};
const pendingAdoptionsByRequestId = {};
const pendingAdoptionsByUserKey = {};

const MONEY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SNIPER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const ROBBERY_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BANK_HEIST_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const ATM_HACK_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const VAN_HEIST_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const JEWELRY_HEIST_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const BASKETBALL_COOLDOWN_MS = 60 * 60 * 1000;
const FOOTBALL_COOLDOWN_MS = 60 * 60 * 1000;
const BOWLING_COOLDOWN_MS = 60 * 60 * 1000;
const KNB_COOLDOWN_MS = 30 * 60 * 1000;

const BOMB_TIMER_MS = 5000;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const MARRIAGE_REQUEST_MS = 10 * 60 * 1000;
const ADOPTION_REQUEST_MS = 10 * 60 * 1000;

const MAX_CUSTOM_COMMANDS = 5;
const CUSTOM_COMMAND_COST = 20;

const MAX_CHILDREN_PER_FAMILY = 3;
const MAX_PUNISHMENT_DAYS = 7;
const MAX_GOOD_DEED_LENGTH = 120;
const MAX_DREAM_LENGTH = 120;

const POLICE_JAIL_MS = 60 * 60 * 1000;

const SHIELD_COST = 250;
const MAX_SHIELDS = 3;

const JAIL_ESCAPE_COOLDOWN_MS = 15 * 60 * 1000;
const JAIL_LAWYER_COOLDOWN_MS = 15 * 60 * 1000;
const JAIL_BRIBE_COOLDOWN_MS = 15 * 60 * 1000;
const JAIL_PRAY_COOLDOWN_MS = 7 * 60 * 1000;
const JAIL_LAWYER_COST = 220;
const JAIL_BRIBE_COST = 300;

const TIME_EDIT_MAX_MINUTES = 10080;
const MAX_LEVEL = 50;
const MAX_WANTED_LEVEL = 5;

const LAY_LOW_DURATION_MS = 6 * 60 * 60 * 1000;
const LAY_LOW_REDUCE_STEP_MS = 2 * 60 * 60 * 1000;
const WANTED_PASSIVE_DECAY_MS = 12 * 60 * 60 * 1000;

const BANK_HEIST_MIN_MEMBERS = 2;
const BANK_HEIST_MAX_MEMBERS = 4;
const VAN_HEIST_MIN_MEMBERS = 2;
const VAN_HEIST_MAX_MEMBERS = 4;

const ITEMS = {
  mask: {
    key: "mask",
    title: "Маска",
    emoji: "🎭",
    price: 35,
    description: "Улучшает шансы на преступления"
  },
  lockpick: {
    key: "lockpick",
    title: "Отмычка",
    emoji: "🗝️",
    price: 50,
    description: "Нужна для банкоматов и помогает в ограблениях"
  },
  radio: {
    key: "radio",
    title: "Рация",
    emoji: "📡",
    price: 80,
    description: "Помогает команде координироваться"
  },
  armor: {
    key: "armor",
    title: "Бронежилет",
    emoji: "🦺",
    price: 120,
    description: "Снижает шанс провала и ареста"
  },
  fake_passport: {
    key: "fake_passport",
    title: "Фальшивый паспорт",
    emoji: "🪪",
    price: 200,
    description: "Иногда снижает последствия полиции"
  },
  jammer: {
    key: "jammer",
    title: "Глушилка",
    emoji: "📴",
    price: 160,
    description: "Помогает против сигнализации"
  }
};

const ITEM_ALIASES = {
  "маска": "mask",
  "mask": "mask",
  "отмычка": "lockpick",
  "отмычки": "lockpick",
  "lockpick": "lockpick",
  "рация": "radio",
  "radio": "radio",
  "бронежилет": "armor",
  "броня": "armor",
  "armor": "armor",
  "фальшивый паспорт": "fake_passport",
  "фальшивыйпаспорт": "fake_passport",
  "поддельный паспорт": "fake_passport",
  "паспорт": "fake_passport",
  "fake_passport": "fake_passport",
  "глушилка": "jammer",
  "jammer": "jammer"
};

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
    .replace(/ё/g, "е")
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
  if (username) return `@${username}`;
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

function formatDateTime(dateValue) {
  const date = new Date(dateValue);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${mins}`;
}

function formatDurationLong(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  if (!parts.length) parts.push("0 мин");
  return parts.join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRandomFromArray(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPendingKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function isRequestExpired(createdAt, ttlMs) {
  return Date.now() - createdAt > ttlMs;
}

function parseGiftPayload(payload) {
  const str = String(payload || "");

  if (str === "coins_50") return { type: "self", amount: 50 };
  if (str === "coins_100") return { type: "self", amount: 100 };
  if (str === "coins_200") return { type: "self", amount: 200 };
  if (str === "coins_300") return { type: "self", amount: 300 };

  const match = str.match(/^giftcoins_(50|100|200|300)_(\d+)$/);
  if (!match) return null;

  return {
    type: "gift",
    amount: Number(match[1]),
    targetUserId: Number(match[2])
  };
}

function getCoupleKeyByUserIds(user1Id, user2Id) {
  const ids = [Number(user1Id), Number(user2Id)].sort((a, b) => a - b);
  return `${ids[0]}:${ids[1]}`;
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
      text: "🐻 Ты нашёл медведя... Он тебя прогнал!",
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
  if (Math.random() < 0.45) {
    return {
      text: "💥 Попадание!",
      coins: Math.floor(Math.random() * 9) + 2
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

function getBasketballResultByDiceValue(value) {
  const dice = Number(value || 0);

  if (dice === 5) {
    return {
      type: "jackpot",
      text: "🏀 Идеальный бросок! Мяч чисто залетел в кольцо! 🔥",
      coins: Math.floor(Math.random() * 10) + 15
    };
  }

  if (dice === 4) {
    return {
      type: "win",
      text: "🏀 Отличный бросок! Попадание!",
      coins: Math.floor(Math.random() * 7) + 8
    };
  }

  if (dice === 3) {
    return {
      type: "normal",
      text: "🏀 Неплохо, мяч почти идеально зашёл.",
      coins: Math.floor(Math.random() * 4) + 4
    };
  }

  return {
    type: "fail",
    text: "❌ Промах. Мяч не залетел в кольцо.",
    coins: -(Math.floor(Math.random() * 5) + 3)
  };
}

function getFootballResultByDiceValue(value) {
  const dice = Number(value || 0);

  if (dice === 6) {
    return {
      type: "jackpot",
      text: "⚽ ГООООЛ! Мяч влетел в девятку!",
      coins: Math.floor(Math.random() * 6) + 10
    };
  }

  if (dice === 5) {
    return {
      type: "great",
      text: "⚽ Отличный удар, это гол!",
      coins: Math.floor(Math.random() * 5) + 8
    };
  }

  if (dice === 4) {
    return {
      type: "good",
      text: "⚽ Хороший удар!",
      coins: Math.floor(Math.random() * 4) + 5
    };
  }

  if (dice === 3) {
    return {
      type: "normal",
      text: "🧤 Вратарь отбил мяч.",
      coins: Math.floor(Math.random() * 3) + 2
    };
  }

  if (dice === 2) {
    return {
      type: "bad",
      text: "😬 Удар слабый, мяч не долетел как надо.",
      coins: -(Math.floor(Math.random() * 3) + 2)
    };
  }

  return {
    type: "fail",
    text: "🥅 Мимо ворот!",
    coins: -(Math.floor(Math.random() * 5) + 4)
  };
}

function getBowlingResultByDiceValue(value) {
  const dice = Number(value || 0);

  if (dice === 6) {
    return {
      type: "jackpot",
      text: "🎳 Страйк! Ты снёс все кегли!",
      coins: Math.floor(Math.random() * 6) + 10
    };
  }

  if (dice === 5) {
    return {
      type: "great",
      text: "🎳 Почти страйк! Очень мощный бросок.",
      coins: Math.floor(Math.random() * 5) + 8
    };
  }

  if (dice === 4) {
    return {
      type: "good",
      text: "🎳 Хороший бросок!",
      coins: Math.floor(Math.random() * 4) + 5
    };
  }

  if (dice === 3) {
    return {
      type: "normal",
      text: "🎳 Неплохо, но можно лучше.",
      coins: Math.floor(Math.random() * 3) + 2
    };
  }

  if (dice === 2) {
    return {
      type: "bad",
      text: "😬 Слабый бросок.",
      coins: -(Math.floor(Math.random() * 4) + 2)
    };
  }

  return {
    type: "fail",
    text: "💀 Полный промах!",
    coins: -(Math.floor(Math.random() * 6) + 5)
  };
}

function getKnbBotChoiceRareWin(playerChoice) {
  const beats = {
    камень: "ножницы",
    ножницы: "бумага",
    бумага: "камень"
  };
  const losesTo = {
    камень: "бумага",
    ножницы: "камень",
    бумага: "ножницы"
  };

  const roll = Math.random();
  if (roll < 0.12) return beats[playerChoice];
  if (roll < 0.40) return playerChoice;
  return losesTo[playerChoice];
}

function resolveKnb(playerChoice, botChoice) {
  if (playerChoice === botChoice) {
    return { type: "draw", text: "🤝 Ничья.", coins: 0 };
  }

  const wins = {
    камень: "ножницы",
    ножницы: "бумага",
    бумага: "камень"
  };

  if (wins[playerChoice] === botChoice) {
    return {
      type: "win",
      text: "🎉 Ты выиграл у бота.",
      coins: Math.floor(Math.random() * 7) + 5
    };
  }

  return {
    type: "lose",
    text: "💀 Бот выиграл.",
    coins: -(Math.floor(Math.random() * 4) + 3)
  };
}

function parseTimeEditAmount(rawValue, rawUnit = "") {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value === 0) return null;

  const unit = normalizeText(rawUnit || "");

  if (!unit || ["ч", "час", "часа", "часов", "h"].includes(unit)) {
    return value * 60 * 60 * 1000;
  }

  if (["м", "мин", "минута", "минуты", "минут", "m"].includes(unit)) {
    return value * 60 * 1000;
  }

  return null;
}

function getCooldownColumnAndMsByName(rawName, userId = null) {
  if (Number(userId) === OWNER_ID) {
    return { column: null, cooldownMs: 0, title: "для владельца нет кулдауна" };
  }

  const name = normalizeText(rawName);

  if (["деньги", "монеты", "money", "daily"].includes(name)) {
    return { column: "last_daily_at", cooldownMs: MONEY_COOLDOWN_MS, title: "деньги" };
  }
  if (["охота", "hunt"].includes(name)) {
    return { column: "last_hunt_at", cooldownMs: HUNT_COOLDOWN_MS, title: "охота" };
  }
  if (["снайпер", "sniper"].includes(name)) {
    return { column: "last_sniper_at", cooldownMs: SNIPER_COOLDOWN_MS, title: "снайпер" };
  }
  if (["ограбление", "ограбить", "robbery"].includes(name)) {
    return { column: "last_robbery_at", cooldownMs: ROBBERY_COOLDOWN_MS, title: "ограбление" };
  }
  if (["ограбление банка", "банк", "bank", "heist"].includes(name)) {
    return { column: "last_bank_at", cooldownMs: BANK_HEIST_COOLDOWN_MS, title: "ограбление банка" };
  }
  if (["банкомат", "взлом банкомата", "atm"].includes(name)) {
    return { column: "last_atm_hack_at", cooldownMs: ATM_HACK_COOLDOWN_MS, title: "взлом банкомата" };
  }
  if (["инкассация", "нападение на инкассацию", "van"].includes(name)) {
    return { column: "last_van_heist_at", cooldownMs: VAN_HEIST_COOLDOWN_MS, title: "нападение на инкассацию" };
  }
  if (["ювелирка", "ограбление ювелирки", "ювелирный", "jewelry"].includes(name)) {
    return { column: "last_jewelry_at", cooldownMs: JEWELRY_HEIST_COOLDOWN_MS, title: "ограбление ювелирки" };
  }
  if (["баскетбол", "basketball"].includes(name)) {
    return { column: "last_basketball_at", cooldownMs: BASKETBALL_COOLDOWN_MS, title: "баскетбол" };
  }
  if (["футбол", "football"].includes(name)) {
    return { column: "last_football_at", cooldownMs: FOOTBALL_COOLDOWN_MS, title: "футбол" };
  }
  if (["боулинг", "bowling"].includes(name)) {
    return { column: "last_bowling_at", cooldownMs: BOWLING_COOLDOWN_MS, title: "боулинг" };
  }
  if (["кнб", "rps", "камень", "ножницы", "бумага"].includes(name)) {
    return { column: "last_knb_at", cooldownMs: KNB_COOLDOWN_MS, title: "кнб" };
  }

  return null;
}

function getShopKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "💰 50 монет — 5 ⭐", callback_data: "buy_self_50" }],
      [{ text: "💰 100 монет — 10 ⭐", callback_data: "buy_self_100" }],
      [{ text: "💰 200 монет — 20 ⭐", callback_data: "buy_self_200" }],
      [{ text: "💰 300 монет — 30 ⭐", callback_data: "buy_self_300" }]
    ]
  };
}

function getGiftShopKeyboard(targetUserId) {
  return {
    inline_keyboard: [
      [{ text: "🎁 50 монет другу — 5 ⭐", callback_data: `buy_gift_50_${targetUserId}` }],
      [{ text: "🎁 100 монет другу — 10 ⭐", callback_data: `buy_gift_100_${targetUserId}` }],
      [{ text: "🎁 200 монет другу — 20 ⭐", callback_data: `buy_gift_200_${targetUserId}` }],
      [{ text: "🎁 300 монет другу — 30 ⭐", callback_data: `buy_gift_300_${targetUserId}` }]
    ]
  };
}

function getMarriageDecisionKeyboard(requestId) {
  return {
    inline_keyboard: [[
      { text: "✅ Да", callback_data: `marriage_yes:${requestId}` },
      { text: "❌ Нет", callback_data: `marriage_no:${requestId}` }
    ]]
  };
}

function getAdoptionDecisionKeyboard(requestId) {
  return {
    inline_keyboard: [[
      { text: "✅ Да", callback_data: `adoption_yes:${requestId}` },
      { text: "❌ Нет", callback_data: `adoption_no:${requestId}` }
    ]]
  };
}

// =========================
// LEVELS
// =========================
function getRequiredXpForLevel(level) {
  if (level <= 1) return 0;
  let xp = 0;
  for (let i = 2; i <= level; i++) {
    xp += 80 + (i - 2) * 20;
  }
  return xp;
}

function getLevelByXp(xp) {
  let level = 1;
  for (let i = 2; i <= MAX_LEVEL; i++) {
    if (xp >= getRequiredXpForLevel(i)) level = i;
    else break;
  }
  return level;
}

function getLevelInfoByXp(xp) {
  const level = getLevelByXp(xp);
  const nextRequired = level >= MAX_LEVEL ? null : getRequiredXpForLevel(level + 1);
  const remaining = nextRequired === null ? 0 : Math.max(0, nextRequired - xp);

  return {
    level,
    xp,
    nextRequired,
    remaining,
    isMax: level >= MAX_LEVEL
  };
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
      snowballs INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      respect INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      last_daily_at TIMESTAMPTZ,
      last_hunt_at TIMESTAMPTZ,
      last_sniper_at TIMESTAMPTZ,
      last_robbery_at TIMESTAMPTZ,
      last_bank_at TIMESTAMPTZ,
      last_atm_hack_at TIMESTAMPTZ,
      last_van_heist_at TIMESTAMPTZ,
      last_jewelry_at TIMESTAMPTZ,
      last_basketball_at TIMESTAMPTZ,
      last_football_at TIMESTAMPTZ,
      last_bowling_at TIMESTAMPTZ,
      last_knb_at TIMESTAMPTZ,
      total INTEGER DEFAULT 0
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS snowballs INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_robbery_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bank_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_atm_hack_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_van_heist_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_jewelry_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_basketball_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_football_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bowling_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_knb_at TIMESTAMPTZ`);

  console.log("✅ Database ready");
}

// =========================
// GAME COOLDOWNS
// =========================
async function updateCooldownColumnNow(userId, column) {
  if (isOwner(userId)) return;
  await pool.query(`UPDATE users SET ${column} = NOW() WHERE user_id = $1`, [userId]);
}

function isOwner(userId) {
  return Number(userId) === Number(OWNER_ID);
}

async function getGenericCooldown(userId, column, cooldownMs) {
  if (isOwner(userId)) return 0;

  const result = await pool.query(
    `SELECT ${column} AS value FROM users WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row || !row.value) return 0;

  const nextTime = new Date(new Date(row.value).getTime() + cooldownMs);
  const diff = nextTime.getTime() - Date.now();

  return diff > 0 ? diff : 0;
}

async function getRobberyCooldown(userId) {
  return getGenericCooldown(userId, "last_robbery_at", ROBBERY_COOLDOWN_MS);
}

async function getBankHeistCooldown(userId) {
  return getGenericCooldown(userId, "last_bank_at", BANK_HEIST_COOLDOWN_MS);
}

async function getAtmHackCooldown(userId) {
  return getGenericCooldown(userId, "last_atm_hack_at", ATM_HACK_COOLDOWN_MS);
}

async function getVanHeistCooldown(userId) {
  return getGenericCooldown(userId, "last_van_heist_at", VAN_HEIST_COOLDOWN_MS);
}

async function getJewelryCooldown(userId) {
  return getGenericCooldown(userId, "last_jewelry_at", JEWELRY_HEIST_COOLDOWN_MS);
}

async function adjustUserCooldown(userId, cooldownName, deltaMs) {
  if (isOwner(userId)) return { title: cooldownName, newDate: new Date(), remainingMs: 0 };

  const info = getCooldownColumnAndMsByName(cooldownName);
  if (!info) throw new Error("UNKNOWN_COOLDOWN_TYPE");

  const result = await pool.query(
    `SELECT ${info.column} AS value FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) throw new Error("USER_NOT_FOUND");

  const currentValue = result.rows[0].value;
  if (!currentValue) throw new Error("COOLDOWN_NOT_USED_YET");

  const currentDate = new Date(currentValue);
  const newDate = new Date(currentDate.getTime() + deltaMs);

  await pool.query(
    `UPDATE users SET ${info.column} = $2 WHERE user_id = $1`,
    [userId, newDate.toISOString()]
  );

  const remainingMs = Math.max(
    0,
    new Date(newDate.getTime() + info.cooldownMs).getTime() - Date.now()
  );

  return {
    title: info.title,
    newDate,
    remainingMs
  };
}

async function getCooldownText(userId) {
  const stats = await getUserStats(userId);
  if (!stats) return "Профиль не найден.";

  const now = new Date();

  function getRemaining(lastAt, cooldownMs) {
    if (!lastAt) return "✅ Уже доступно";

    const nextTime = new Date(new Date(lastAt).getTime() + cooldownMs);
    const diff = nextTime.getTime() - now.getTime();

    return diff <= 0 ? "✅ Уже доступно" : `⏳ ${formatRemainingTime(diff)}`;
  }

  return `⏱ Кулдауны

💰 Деньги: ${getRemaining(stats.last_daily_at, MONEY_COOLDOWN_MS)}
🏹 Охота: ${getRemaining(stats.last_hunt_at, HUNT_COOLDOWN_MS)}
🎯 Снайпер: ${getRemaining(stats.last_sniper_at, SNIPER_COOLDOWN_MS)}
🕵️ Ограбление: ${getRemaining(stats.last_robbery_at, ROBBERY_COOLDOWN_MS)}
🏦 Ограбление банка: ${getRemaining(stats.last_bank_at, BANK_HEIST_COOLDOWN_MS)}
🏧 Взлом банкомата: ${getRemaining(stats.last_atm_hack_at, ATM_HACK_COOLDOWN_MS)}
🚚 Инкассация: ${getRemaining(stats.last_van_heist_at, VAN_HEIST_COOLDOWN_MS)}
💎 Ювелирка: ${getRemaining(stats.last_jewelry_at, JEWELRY_HEIST_COOLDOWN_MS)}
🏀 Баскетбол: ${getRemaining(stats.last_basketball_at, BASKETBALL_COOLDOWN_MS)}
⚽ Футбол: ${getRemaining(stats.last_football_at, FOOTBALL_COOLDOWN_MS)}
🎳 Боулинг: ${getRemaining(stats.last_bowling_at, BOWLING_COOLDOWN_MS)}
✂️ КНБ: ${getRemaining(stats.last_knb_at, KNB_COOLDOWN_MS)}`;
}

// =========================
// GAME ACTIONS
// =========================
async function runFootball(userId) {
  const result = await pool.query(
    `SELECT balance, last_football_at FROM users WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastAt = row.last_football_at ? new Date(row.last_football_at) : null;

  if (lastAt) {
    const nextTime = new Date(lastAt.getTime() + FOOTBALL_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
    }
  }

  return { ok: true };
}

async function processStarPurchase(buyerUserId, successfulPayment) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT telegram_payment_charge_id FROM star_purchases WHERE telegram_payment_charge_id = $1`,
      [successfulPayment.telegram_payment_charge_id]
    );

    if (existing.rows.length > 0) {
      const balanceRow = await client.query(`SELECT balance FROM users WHERE user_id = $1`, [buyerUserId]);
      await client.query("COMMIT");

      return {
        alreadyProcessed: true,
        gift: false,
        buyerBalance: Number(balanceRow.rows[0]?.balance || 0),
        coinsAdded: 0
      };
    }

    const parsed = parseGiftPayload(successfulPayment.invoice_payload);
    if (!parsed) throw new Error("BAD_PAYMENT_PAYLOAD");

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
        buyerUserId,
        successfulPayment.invoice_payload,
        successfulPayment.total_amount,
        successfulPayment.currency
      ]
    );

    if (parsed.type === "self") {
      const balanceResult = await client.query(
        `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE user_id = $1 RETURNING balance`,
        [buyerUserId, parsed.amount]
      );

      await client.query("COMMIT");

      return {
        alreadyProcessed: false,
        gift: false,
        buyerBalance: Number(balanceResult.rows[0]?.balance || 0),
        coinsAdded: parsed.amount
      };
    }

    await client.query(
      `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE user_id = $1`,
      [parsed.targetUserId, parsed.amount]
    );

    const buyerBalanceRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [buyerUserId]
    );
    const targetBalanceRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [parsed.targetUserId]
    );

    await client.query("COMMIT");

    return {
      alreadyProcessed: false,
      gift: true,
      targetUserId: parsed.targetUserId,
      coinsAdded: parsed.amount,
      buyerBalance: Number(buyerBalanceRow.rows[0]?.balance || 0),
      targetBalance: Number(targetBalanceRow.rows[0]?.balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

setInterval(async () => {
  try {
    await processLayLowReductions();
    await processPassiveWantedDecay();
  } catch (error) {
    console.error("Ошибка периодической обработки lay low / wanted:", error);
  }
}, 60 * 1000);

// =========================
// RP COMMANDS
// =========================
const rpCommands = {
  "убить": { text: "убил", stat: "kills", emoji: "💀", xp: 2 },
  "обнять": { text: "обнял", stat: "hugs", emoji: "❤️", xp: 2 },
  "поцеловать": { text: "поцеловал", stat: "kisses", emoji: "💋", xp: 2 },
  "ударить": { text: "ударил", stat: "hits", emoji: "👊", xp: 2 },
  "укусить": { text: "укусил", stat: "bites", emoji: "😈", xp: 2 },
  "погладить": { text: "погладил", stat: "pats", emoji: "🤲", xp: 2 },
  "пнуть": { text: "пнул", stat: "kicks", emoji: "🦵", xp: 2 },
  "шлепнуть": { text: "шлёпнул", stat: "slaps", emoji: "🖐", xp: 2 },
  "врезать": { text: "врезал", stat: "punches", emoji: "🥊", xp: 2 },
  "лизнуть": { text: "лизнул", stat: "licks", emoji: "👅", xp: 2 },
  "украсть": { text: "обокрал", stat: "steals", emoji: "🕵️", xp: 2 },
  "заскамить": { text: "заскамил", stat: "scams", emoji: "💸", xp: 2 },
  "уничтожить": { text: "уничтожил", stat: "destroys", emoji: "☠️", xp: 2 },
  "разбудить": { text: "разбудил", stat: "wakes", emoji: "⏰", xp: 2 },
  "заморозить": { text: "заморозил", stat: "freezes", emoji: "🧊", xp: 2 },
  "спасти": { text: "спас", stat: "saves", emoji: "🛡️", xp: 2 },
  "кинуть снежок": { text: "кинул снежок в", stat: "snowballs", emoji: "❄️", xp: 2 }
};

// =========================
// COMMANDS
// =========================
bot.onText(/^\/start(@[A-Za-z0-9_]+)?$/, async (msg) => {
  await safeSendMessage(
    msg.chat.id,
    `🔥 <b>Мини Модератор — бот для Telegram групп</b>

<b>📚 Разделы бота:</b>

<b>👨‍👩‍👧 Семья</b>
• брак
• зарегистрироваться в брак
• развод
• семья
• усыновить
• отказаться от ребенка
• сбежать из семьи
• любимый ребенок
• убрать любимого ребенка
• карманные деньги 50
• попросить денег 5
• дать ребенку 5
• семейный бюджет
• вложить в бюджет 5
• взять с бюджета 5
• создать копилку
• копилка
• пополнить копилку 5
• разбить копилку
• загадать мечту айфон
• моя мечта
• удалить мечту
• пополнить баланс на мечту 5
• на мечту 5
• наказать ребенка 1
• наказание
• снять наказание
• похвалить ребенка
• наградить ребенка 20
• добавить доброе дело помог по дому
• список добрых дел
• удалить доброе дело 1
• очистить добрые дела
• послушание
• ревновать
• ревность
• помириться

<b>💰 Деньги</b>
• деньги
• охота
• снайпер
• баскетбол
• боулинг
• кнб камень
• кнб ножницы
• кнб бумага
• купить монеты
• купить монеты другу
• купить щит
• мой щит

<b>🏦 Ограбления</b>
• ограбление банка
• нападение на инкассацию
• ограбление ювелирки
• взлом банкомата
• ограбить @username

<b>🎒 Инвентарь</b>
• инвентарь
• черный рынок
• купить маска
• купить отмычку
• купить рацию
• купить бронежилет
• купить фальшивый паспорт
• купить глушилку

<b>🚨 Розыск</b>
• розыск
• топ розыска
• сдаться
• залечь на дно
• скрытность
• выйти из тени

<b>🚔 Тюрьма</b>
• тюрьма
• репутация
• сбежать из тюрьмы
• адвокат
• подкупить охрану
• молиться
• отсидеть

<b>👤 Профиль</b>
• /profile
• /balance
• /cooldowns
• уровень
• топ уровней
• топ богачей
• респект

<b>🎭 RP команды</b>
• убить @username
• обнять @username
• поцеловать @username
• ударить @username
• укусить @username
• погладить @username
• пнуть @username
• шлепнуть @username
• врезать @username
• лизнуть @username
• украсть @username
• заскамить @username
• уничтожить @username
• разбудить @username
• заморозить @username
• спасти @username
• подарок @username
• кинуть снежок @username

<b>🛠 Свои команды</b>
• /createcommand
• /mycommands
• /deletecommand

<b>🎮 Игры и фан</b>
• бомба
• передать
• пара
• кто ...
• оценка
• прогноз
• он врет?`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
});

bot.onText(/^\/profile(@[A-Za-z0-9_]+)?$/, async (msg) => {
  try {
    let targetUser = null;
    if (msg.reply_to_message) targetUser = await resolveTargetUserFromReply(msg);
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

bot.onText(/^уровень$/i, async (msg) => {
  try {
    await initUser(msg.from);
    const stats = await getUserStats(msg.from.id);
    const info = getLevelInfoByXp(Number(stats?.xp || 0));

    const text = info.isMax
      ? `🏆 Уровень игрока ${getUserLink(msg.from)}

Уровень: ${info.level}
Опыт: ${info.xp}
Ты достиг максимального уровня`
      : `⭐ Уровень игрока ${getUserLink(msg.from)}

Уровень: ${info.level}
Опыт: ${info.xp}
До следующего уровня: ${info.remaining} XP
Следующий уровень: ${info.level + 1}`;

    await safeSendMessage(msg.chat.id, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error("Ошибка команды уровень:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении уровня.");
  }
});

bot.onText(/^топ уровней$/i, async (msg) => {
  try {
    const result = await pool.query(`
      SELECT user_id, first_name, last_name, username, level, xp
      FROM users
      ORDER BY level DESC, xp DESC, balance DESC
      LIMIT 10
    `);

    if (!result.rows.length) {
      await safeSendMessage(msg.chat.id, "Пока нет игроков для топа.");
      return;
    }

    const lines = result.rows.map((row, index) => {
      const user = {
        id: Number(row.user_id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        username: row.username || ""
      };
      return `${index + 1}. ${getUserLink(user)} — ур. ${Number(row.level || 1)} | XP: ${Number(row.xp || 0)}`;
    });

    await safeSendMessage(
      msg.chat.id,
      `🏆 Топ уровней

${lines.join("\n")}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка команды топ уровней:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении топа уровней.");
  }
});

bot.onText(/^топ богачей$/i, async (msg) => {
  try {
    const result = await pool.query(`
      SELECT user_id, first_name, last_name, username, balance
      FROM users
      ORDER BY balance DESC, level DESC
      LIMIT 10
    `);

    if (!result.rows.length) {
      await safeSendMessage(msg.chat.id, "Пока нет игроков для топа.");
      return;
    }

    const lines = result.rows.map((row, index) => {
      const user = {
        id: Number(row.user_id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        username: row.username || ""
      };
      return `${index + 1}. ${getUserLink(user)} — ${Number(row.balance || 0)} монет`;
    });

    await safeSendMessage(
      msg.chat.id,
      `💰 Топ богачей

${lines.join("\n")}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка команды топ богачей:", error);
    await safeSendMessage(msg.chat.id, "Ошибка при получении топа богачей.");
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
    const purchase = await processStarPurchase(msg.from.id, msg.successful_payment);

    if (purchase.alreadyProcessed) {
      await safeSendMessage(
        msg.chat.id,
        `ℹ️ Оплата уже обработана.\n\nБаланс: ${purchase.buyerBalance} монет`
      );
      return;
    }

    if (!purchase.gift) {
      await safeSendMessage(
        msg.chat.id,
        `✅ Оплата прошла успешно!

💰 Вам начислено ${purchase.coinsAdded} монет
Баланс: ${purchase.buyerBalance} монет`
      );
      return;
    }

    const targetUser = await getStoredUser(purchase.targetUserId);

    await safeSendMessage(
      msg.chat.id,
      `✅ Подарок куплен успешно!

🎁 ${getUserLink(targetUser)} получил(а) ${purchase.coinsAdded} монет
💰 Баланс получателя: ${purchase.targetBalance} монет`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка successful_payment:", error);
  }
});

bot.on("callback_query", async (query) => {
  try {
    if (!query.data || !query.message || !query.from) return;

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = String(query.data);

    if (data.startsWith("buy_self_")) {
      await safeAnswerCallback(query);
      await initUser(query.from);

      const amountCoins = Number(data.split("_")[2]);

      let title = `${amountCoins} монет`;
      let description = `Покупка ${amountCoins} монет за Telegram Stars`;
      let payload = `coins_${amountCoins}`;
      let amountStars = 5;

      if (amountCoins === 100) amountStars = 10;
      if (amountCoins === 200) amountStars = 20;
      if (amountCoins === 300) amountStars = 30;

      await bot.sendInvoice(
        chatId,
        title,
        description,
        payload,
        "",
        "XTR",
        [{ label: title, amount: amountStars }]
      );
      return;
    }

    if (data.startsWith("buy_gift_")) {
      await safeAnswerCallback(query);
      await initUser(query.from);

      const match = data.match(/^buy_gift_(50|100|200|300)_(\d+)$/);
      if (!match) return;

      const coins = Number(match[1]);
      const targetUserId = Number(match[2]);
      const targetUser = await getStoredUser(targetUserId);

      let amountStars = 5;
      if (coins === 100) amountStars = 10;
      if (coins === 200) amountStars = 20;
      if (coins === 300) amountStars = 30;

      const title = `Подарок: ${coins} монет`;
      const description = `Подарить ${coins} монет игроку ${getUserName(targetUser)}`;
      const payload = `giftcoins_${coins}_${targetUserId}`;

      await bot.sendInvoice(
        chatId,
        title,
        description,
        payload,
        "",
        "XTR",
        [{ label: title, amount: amountStars }]
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

    const originalText = (msg.text || "").trim();
    const lowerText = normalizeText(originalText);

    if (lowerText.startsWith("/")) return;

    const pendingKey = getPendingKey(msg.chat.id, msg.from.id);

    // CUSTOM COMMAND CREATION
    if (pendingCommandCreation[pendingKey]) {
      delete pendingCommandCreation[pendingKey];

      const parsed = parseCreateCommandInput(originalText);
      if (!parsed) {
        await safeSendMessage(msg.chat.id, `❌ Напиши в формате:
команда действие

Пример:
облил облил водой`);
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
        await safeSendMessage(msg.chat.id, `❌ У тебя уже максимум команд: ${MAX_CUSTOM_COMMANDS}`);
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

      let resultText = `✅ Команда "${escapeHtml(parsed.trigger)}" создана!

Теперь:
${escapeHtml(parsed.trigger)} — команда
${escapeHtml(parsed.actionText)} — текст бота

Списано: ${CUSTOM_COMMAND_COST} монет`;

      resultText = await appendLevelUpIfNeeded(resultText, msg.from.id, 4);

      await safeSendMessage(msg.chat.id, resultText, { parse_mode: "HTML" });
      return;
    }

    // PENDING YES / NO
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

    // =========================
    // REPUTATION
    // =========================
    if (isExactCommand(lowerText, "репутация")) {
      let targetUser = msg.from;
      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const text = await getReputationText(targetUser);
      await safeSendMessage(msg.chat.id, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // =========================
    // WANTED / STEALTH COMMANDS
    // =========================
    if (isExactCommand(lowerText, "розыск")) {
      let targetUser = msg.from;
      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const wanted = await getWantedRow(targetUser.id);
      const layLow = await getLayLowStatus(targetUser.id);

      const layLowText =
        layLow && layLow.is_active
          ? `✅ Да, осталось: ${formatRemainingTime(new Date(layLow.until_at).getTime() - Date.now())}`
          : "❌ Нет";

      await safeSendMessage(
        msg.chat.id,
        `🚨 Розыск

Игрок: ${getUserLink(targetUser)}
Уровень: ${Number(wanted?.level || 0)}/${MAX_WANTED_LEVEL}
Статус: ${escapeHtml(getWantedStatusText(wanted?.level || 0))}
Скрытность: ${layLowText}

${escapeHtml(getWantedEffectText(wanted?.level || 0))}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "топ розыска")) {
      const result = await pool.query(`
        SELECT u.user_id, u.first_name, u.last_name, u.username, w.level
        FROM wanted_status w
        JOIN users u ON u.user_id = w.user_id
        WHERE w.level > 0
        ORDER BY w.level DESC, w.updated_at DESC
        LIMIT 10
      `);

      if (!result.rows.length) {
        await safeSendMessage(msg.chat.id, "✅ Сейчас в розыске никого нет.");
        return;
      }

      const lines = result.rows.map((row, index) => {
        const user = {
          id: Number(row.user_id),
          first_name: row.first_name || "",
          last_name: row.last_name || "",
          username: row.username || ""
        };
        return `${index + 1}. ${getUserLink(user)} — ${Number(row.level || 0)}/${MAX_WANTED_LEVEL} (${escapeHtml(getWantedStatusText(row.level || 0))})`;
      });

      await safeSendMessage(
        msg.chat.id,
        `🚨 Топ розыска

${lines.join("\n")}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "сдаться")) {
      const wanted = await getWantedRow(msg.from.id);
      const level = Number(wanted?.level || 0);

      if (level <= 0) {
        await safeSendMessage(msg.chat.id, "✅ Ты и так не в розыске.");
        return;
      }

      const jailTime = Math.max(20, level * 20) * 60 * 1000;
      const jail = await sendUserToJail(msg.from.id, jailTime);
      await setWantedLevel(msg.from.id, Math.max(0, level - 2));
      await deactivateLayLow(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `🚔 ${getUserLink(msg.from)} сдался полиции.

⛓ Ты отправлен в тюрьму
🕒 До: ${formatDateTime(jail.until_at)}
📉 Розыск немного снижен`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "залечь на дно")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const wanted = await getWantedRow(msg.from.id);
      const level = Number(wanted?.level || 0);

      if (level <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Залечь на дно можно только если у тебя есть розыск.");
        return;
      }

      const layLow = await getLayLowStatus(msg.from.id);
      if (layLow?.is_active) {
        const remain = new Date(layLow.until_at).getTime() - Date.now();
        await safeSendMessage(msg.chat.id, `🕶 Ты уже в скрытности.\n⏳ Осталось: ${formatRemainingTime(remain)}`);
        return;
      }

      const activated = await activateLayLow(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `🕶 ${getUserLink(msg.from)} залёг(ла) на дно.

⏳ Скрытность активна: ${formatRemainingTime(new Date(activated.until_at).getTime() - Date.now())}
📉 Во время скрытности розыск будет постепенно снижаться
❌ Преступления временно запрещены`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "скрытность")) {
      const layLow = await getLayLowStatus(msg.from.id);

      if (!layLow || !layLow.is_active) {
        await safeSendMessage(msg.chat.id, "🕶 Скрытность сейчас не активна.");
        return;
      }

      const remain = new Date(layLow.until_at).getTime() - Date.now();
      await safeSendMessage(
        msg.chat.id,
        `🕶 Скрытность активна

Игрок: ${getUserLink(msg.from)}
⏳ Осталось: ${formatRemainingTime(remain)}
🕒 Запущена: ${formatDateTime(layLow.created_at)}

❌ Пока скрытность активна, преступления запрещены.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "выйти из тени")) {
      const layLow = await getLayLowStatus(msg.from.id);
      if (!layLow || !layLow.is_active) {
        await safeSendMessage(msg.chat.id, "❌ Ты и так не в скрытности.");
        return;
      }

      await deactivateLayLow(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `☀️ ${getUserLink(msg.from)} вышел(вышла) из тени.

Теперь преступления снова доступны.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // INVENTORY / BLACK MARKET
    // =========================
    if (isExactCommand(lowerText, "инвентарь")) {
      const inventory = await getFullInventory(msg.from.id);

      const lines = Object.keys(ITEMS).map((key) => {
        const item = ITEMS[key];
        const count = Number(inventory[key] || 0);
        return `${item.emoji} ${escapeHtml(item.title)} — ${count}`;
      });

      await safeSendMessage(
        msg.chat.id,
        `🎒 Инвентарь игрока ${getUserLink(msg.from)}

${lines.join("\n")}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "черный рынок") || isExactCommand(lowerText, "чёрный рынок")) {
      const lines = Object.values(ITEMS).map((item) =>
        `${item.emoji} ${escapeHtml(item.title)} — ${item.price} монет\n${escapeHtml(item.description)}`
      );

      await safeSendMessage(
        msg.chat.id,
        `🕶 Чёрный рынок

${lines.join("\n\n")}

Купить:
• купить маска
• купить отмычка
• купить рация
• купить бронежилет
• купить фальшивый паспорт
• купить глушилка`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("купить ")) {
      const rawItem = originalText.slice("купить ".length).trim();
      const itemKey = resolveItemKey(rawItem);

      if (itemKey && ITEMS[itemKey]) {
        try {
          const result = await buyBlackMarketItem(msg.from.id, itemKey);
          const item = ITEMS[itemKey];

          let out = `🛒 ${getUserLink(msg.from)} купил(а) ${item.emoji} ${escapeHtml(item.title)}

📦 Теперь у тебя: ${result.itemCount}
👛 Баланс: ${result.balance}`;

          out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

          await safeSendMessage(msg.chat.id, out, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
        } catch (error) {
          if (error.message === "NOT_ENOUGH_MONEY") {
            await safeSendMessage(msg.chat.id, "❌ Недостаточно монет.");
            return;
          }

          console.error("Ошибка покупки предмета:", error);
          await safeSendMessage(msg.chat.id, "❌ Ошибка покупки предмета.");
        }
        return;
      }
    }

    // RELATIONSHIP COMMANDS
    if (isExactCommand(lowerText, "ревновать")) {
      const target = await resolveTargetUserUniversal(msg);
      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение супруга(и) или напиши: ревновать @username");
        return;
      }

      const isTargetSpouse = await isSpouse(msg.from.id, target.id);
      if (!isTargetSpouse) {
        await safeSendMessage(msg.chat.id, "❌ Ревновать можно только своего супруга(у).");
        return;
      }

      const added = Math.floor(Math.random() * 11) + 5;
      const state = await changeCoupleJealousy(msg.from.id, target.id, added);

      let mood = "😶 Всё пока спокойно.";
      if (Number(state.jealousy) >= 70) mood = "🔥 В семье уже сильная ревность.";
      else if (Number(state.jealousy) >= 40) mood = "😬 Напряжение в семье растёт.";

      let out = `💚 ${getUserLink(msg.from)} приревновал(а) ${getUserLink(target)}.

📈 Ревность семьи: ${Number(state.jealousy || 0)}/100
${mood}`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "ревность")) {
      let targetUser = msg.from;
      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const partnerInfo = await getMarriagePartner(targetUser.id);
      if (!partnerInfo) {
        await safeSendMessage(msg.chat.id, "❌ Команда доступна только игроку в браке.");
        return;
      }

      const state = await getCoupleState(targetUser.id, partnerInfo.partnerId);
      const partnerUser = await getStoredUser(partnerInfo.partnerId);

      let mood = "😌 Всё спокойно";
      if (Number(state.jealousy) >= 70) mood = "🔥 Очень высокая";
      else if (Number(state.jealousy) >= 40) mood = "😬 Средняя";
      else if (Number(state.jealousy) >= 15) mood = "🙂 Небольшая";

      await safeSendMessage(
        msg.chat.id,
        `💞 Ревность в паре

👤 Игрок: ${getUserLink(targetUser)}
💍 Пара: ${getUserLink(partnerUser)}
📈 Уровень ревности: ${Number(state.jealousy || 0)}/100
📝 Состояние: ${mood}
🕒 Обновлено: ${formatDateTime(state.updated_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "помириться")) {
      const target = await resolveTargetUserUniversal(msg);
      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение супруга(и) или напиши: помириться @username");
        return;
      }

      const isTargetSpouse = await isSpouse(msg.from.id, target.id);
      if (!isTargetSpouse) {
        await safeSendMessage(msg.chat.id, "❌ Мириться можно только со своим супругом(ой).");
        return;
      }

      const reduced = Math.floor(Math.random() * 16) + 10;
      const state = await changeCoupleJealousy(msg.from.id, target.id, -reduced);

      let out = `🕊 ${getUserLink(msg.from)} помирился(ась) с ${getUserLink(target)}.

📉 Ревность семьи: ${Number(state.jealousy || 0)}/100`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // SHIELDS
    if (isExactCommand(lowerText, "купить щит")) {
      const shield = await getShieldRow(msg.from.id);

      if (Number(shield?.count || 0) >= MAX_SHIELDS) {
        await safeSendMessage(
          msg.chat.id,
          `🛡 Щит стоит ${SHIELD_COST} монет.

У тебя уже максимум щитов: ${MAX_SHIELDS}/${MAX_SHIELDS}
Больше купить нельзя.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      try {
        const result = await buyShield(msg.from.id);

        let out = `🛡 ${getUserLink(msg.from)} купил(а) щит.

💸 Цена щита: ${SHIELD_COST} монет
🛡 Щитов сейчас: ${result.shieldCount}/${MAX_SHIELDS}
👛 Твой баланс: ${result.userBalance}

💡 Один щит блокирует одно успешное ограбление.`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, `❌ Щит стоит ${SHIELD_COST} монет.\nУ тебя недостаточно монет.`);
          return;
        }

        if (error.message === "MAX_SHIELDS_REACHED") {
          await safeSendMessage(msg.chat.id, `❌ У тебя уже максимум щитов: ${MAX_SHIELDS}/${MAX_SHIELDS}`);
          return;
        }

        console.error("Ошибка покупки щита:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка покупки щита.");
      }
      return;
    }

    if (isExactCommand(lowerText, "мой щит")) {
      const shield = await getShieldRow(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `🛡 Щиты игрока ${getUserLink(msg.from)}

Количество: ${Number(shield?.count || 0)}/${MAX_SHIELDS}
💸 Цена одного щита: ${SHIELD_COST} монет
💡 Один щит блокирует одно успешное ограбление.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // FAMILY COMMANDS
    if (lowerText.startsWith("наказать ребенка")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: наказать ребенка 1 @username");
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^наказать ребенка\s+(\d+)$/);
      const days = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(days) || days < 1 || days > MAX_PUNISHMENT_DAYS) {
        await safeSendMessage(msg.chat.id, `❌ Укажи от 1 до ${MAX_PUNISHMENT_DAYS} дней.`);
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const punishment = await setPunishment(parent.id, child.id, days);
      await changeChildObedience(child.id, -10);

      let out = `⛔ ${getUserLink(parent)} наказал(а) ${getUserLink(child)} на ${days} дн.

📌 Ограничения:
• нельзя просить деньги
• нельзя получать карманные деньги
• нельзя брать из семейного бюджета

🕒 До: ${formatDateTime(punishment.until_at)}`;

      out = await appendLevelUpIfNeeded(out, parent.id, 4);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "снять наказание")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: снять наказание @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const removed = await removePunishment(child.id);
      if (!removed) {
        await safeSendMessage(msg.chat.id, "✅ У этого ребёнка и так нет активного наказания.");
        return;
      }

      await changeChildObedience(child.id, 5);

      let out = `✅ ${getUserLink(parent)} снял(а) наказание с ${getUserLink(child)}.`;
      out = await appendLevelUpIfNeeded(out, parent.id, 3);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "наказание")) {
      let targetUser = msg.from;

      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const punishment = await getActivePunishment(targetUser.id);
      if (!punishment) {
        await safeSendMessage(msg.chat.id, "✅ Наказания нет.");
        return;
      }

      const punisher = await getStoredUser(Number(punishment.punished_by_user_id));
      const remaining = new Date(punishment.until_at).getTime() - Date.now();

      await safeSendMessage(
        msg.chat.id,
        `⛔ Наказание активно

👶 Ребёнок: ${getUserLink(targetUser)}
👨 Наказал(а): ${getUserLink(punisher)}
🕒 До: ${formatDateTime(punishment.until_at)}
⏳ Осталось: ${formatRemainingTime(remaining)}

📌 Ограничения:
• нельзя просить деньги
• нельзя получать карманные деньги
• нельзя брать из семейного бюджета`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "похвалить ребенка")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: похвалить ребенка @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const obedience = await changeChildObedience(child.id, 5);

      let out = `🌟 ${getUserLink(parent)} похвалил(а) ${getUserLink(child)}!

📈 Послушание: ${Number(obedience.value || 0)}/100`;

      out = await appendLevelUpIfNeeded(out, parent.id, 3);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (lowerText.startsWith("наградить ребенка")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: наградить ребенка 20 @username");
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^наградить ребенка\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      try {
        const transferResult = await transferCoins(parent.id, child.id, amount);
        const obedience = await changeChildObedience(child.id, 3);

        let out = `🎁 ${getUserLink(parent)} наградил(а) ${getUserLink(child)} на ${amount} монет!

👛 Баланс ${escapeHtml(getUserName(parent))}: ${transferResult.fromBalance}
👛 Баланс ${escapeHtml(getUserName(child))}: ${transferResult.toBalance}
📈 Послушание: ${Number(obedience.value || 0)}/100`;

        out = await appendLevelUpIfNeeded(out, parent.id, 5);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка награды ребёнку:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка награждения ребёнка.");
      }

      return;
    }

    if (lowerText.startsWith("добавить доброе дело")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: добавить доброе дело помог по дому @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const cleanedNoMention = cleanupTextWithoutMention(originalText);
      const deedText = cleanedNoMention.slice("добавить доброе дело".length).trim();
      if (!deedText || deedText.length < 2) {
        await safeSendMessage(msg.chat.id, "❌ Напиши так:\nдобавить доброе дело помог по дому @username");
        return;
      }

      if (deedText.length > MAX_GOOD_DEED_LENGTH) {
        await safeSendMessage(msg.chat.id, `❌ Доброе дело слишком длинное. Максимум ${MAX_GOOD_DEED_LENGTH} символов.`);
        return;
      }

      await addGoodDeed(parent.id, child.id, deedText);
      const obedience = await changeChildObedience(child.id, 3);

      let out = `✅ ${getUserLink(parent)} добавил(а) доброе дело для ${getUserLink(child)}

📔 Дело: ${escapeHtml(deedText)}
📈 Послушание: ${Number(obedience.value || 0)}/100`;

      out = await appendLevelUpIfNeeded(out, parent.id, 4);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "список добрых дел")) {
      let targetUser = msg.from;

      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const childInfo = await getActiveAdoptionByChildId(targetUser.id);
      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Список добрых дел доступен только ребёнку в семье.");
        return;
      }

      const deeds = await getGoodDeeds(targetUser.id);
      if (!deeds.length) {
        await safeSendMessage(msg.chat.id, `📔 У ${escapeHtml(getUserName(targetUser))} пока нет добрых дел.`, { parse_mode: "HTML" });
        return;
      }

      const lines = deeds.map((deed, index) => `${index + 1}. ${escapeHtml(deed.deed_text)}`);

      await safeSendMessage(
        msg.chat.id,
        `📔 Добрые дела ${getUserLink(targetUser)}

${lines.join("\n")}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("удалить доброе дело")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: удалить доброе дело 1 @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^удалить доброе дело\s+(\d+)$/);
      const index = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(index) || index <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи номер.");
        return;
      }

      const deleted = await deleteGoodDeedByIndex(child.id, index);
      if (!deleted) {
        await safeSendMessage(msg.chat.id, "❌ Доброго дела с таким номером нет.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🗑 ${getUserLink(parent)} удалил(а) доброе дело у ${getUserLink(child)}

Удалено: ${escapeHtml(deleted.deed_text)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "очистить добрые дела")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: очистить добрые дела @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const deletedCount = await clearGoodDeeds(child.id);

      await safeSendMessage(
        msg.chat.id,
        `🧹 ${getUserLink(parent)} очистил(а) список добрых дел ${getUserLink(child)}

Удалено записей: ${deletedCount}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "послушание")) {
      let targetUser = msg.from;

      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const childInfo = await getActiveAdoptionByChildId(targetUser.id);
      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Послушание доступно только ребёнку в семье.");
        return;
      }

      const obedience = await getChildObedience(targetUser.id);
      await safeSendMessage(
        msg.chat.id,
        `📈 Послушание ${getUserLink(targetUser)}

Уровень: ${Number(obedience?.value || 0)}/100
🕒 Обновлено: ${formatDateTime(obedience.updated_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "семейный бюджет")) {
      const budget = await getFamilyBudget(msg.from.id);

      if (!budget) {
        await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в семье. Семейный бюджет доступен только семье.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🏦 Семейный бюджет

👤 Игрок: ${getUserLink(msg.from)}
💰 В бюджете семьи: ${Number(budget.balance || 0)} монет
🕒 Обновлён: ${formatDateTime(budget.updated_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("вложить в бюджет")) {
      const match = lowerText.match(/^вложить в бюджет\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      try {
        const result = await addToFamilyBudget(msg.from.id, amount);

        let out = `🏦 ${getUserLink(msg.from)} вложил(а) в семейный бюджет ${amount} монет

💰 Бюджет семьи: ${result.familyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлён: ${formatDateTime(result.updatedAt)}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_FAMILY") {
          await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в семье.");
          return;
        }

        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка вложения в семейный бюджет:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка пополнения семейного бюджета.");
      }

      return;
    }

    if (lowerText.startsWith("взять с бюджета")) {
      const match = lowerText.match(/^взять с бюджета\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      const childInfo = await getActiveAdoptionByChildId(msg.from.id);
      if (childInfo) {
        const punishmentText = await getPunishedBlockText(msg.from.id);
        if (punishmentText) {
          await safeSendMessage(msg.chat.id, `${punishmentText}\nВо время наказания нельзя брать деньги из семейного бюджета.`);
          return;
        }
      }

      try {
        const result = await takeFromFamilyBudget(msg.from.id, amount);

        let out = `🏦 ${getUserLink(msg.from)} взял(а) из семейного бюджета ${amount} монет

💰 Бюджет семьи: ${result.familyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлён: ${formatDateTime(result.updatedAt)}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_FAMILY") {
          await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в семье.");
          return;
        }

        if (error.message === "NOT_ENOUGH_FAMILY_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ В семейном бюджете недостаточно монет.");
          return;
        }

        console.error("Ошибка снятия с семейного бюджета:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка снятия денег из семейного бюджета.");
      }

      return;
    }

    if (isExactCommand(lowerText, "создать копилку")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Копилка доступна только ребёнку в семье.");
        return;
      }

      const existing = await getPiggyBank(msg.from.id);
      if (existing) {
        await safeSendMessage(msg.chat.id, `🐷 У тебя уже есть копилка.\n💰 В копилке: ${Number(existing.balance || 0)} монет`);
        return;
      }

      const piggy = await createPiggyBank(msg.from.id);

      let out = `🐷 ${getUserLink(msg.from)} создал(а) копилку!

💰 В копилке: ${Number(piggy.balance || 0)} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "копилка")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Копилка доступна только ребёнку в семье.");
        return;
      }

      const piggy = await getPiggyBank(msg.from.id);
      if (!piggy) {
        await safeSendMessage(msg.chat.id, "❌ У тебя нет копилки.\nНапиши: создать копилку");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🐷 Копилка ${getUserLink(msg.from)}

💰 В копилке: ${Number(piggy.balance || 0)} монет
🕒 Обновлена: ${formatDateTime(piggy.updated_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("пополнить копилку")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Копилка доступна только ребёнку в семье.");
        return;
      }

      const match = lowerText.match(/^пополнить копилку\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      try {
        const result = await addToPiggyBank(msg.from.id, amount);

        let out = `🐷 ${getUserLink(msg.from)} положил(а) в копилку ${amount} монет

💰 В копилке: ${result.piggyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлена: ${formatDateTime(result.updatedAt)}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_PIGGY_BANK") {
          await safeSendMessage(msg.chat.id, "❌ У тебя нет копилки.\nНапиши: создать копилку");
          return;
        }

        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка пополнения копилки:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка пополнения копилки.");
      }

      return;
    }

    if (isExactCommand(lowerText, "разбить копилку")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Копилка доступна только ребёнку в семье.");
        return;
      }

      try {
        const result = await breakPiggyBank(msg.from.id);

        let out = `💥 ${getUserLink(msg.from)} разбил(а) копилку и достал(а) ${result.taken} монет!

🐷 В копилке: ${result.piggyBalance}
👛 Твой баланс: ${result.userBalance}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_PIGGY_BANK") {
          await safeSendMessage(msg.chat.id, "❌ У тебя нет копилки.\nНапиши: создать копилку");
          return;
        }

        console.error("Ошибка разбития копилки:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка при разбитии копилки.");
      }

      return;
    }

    if (lowerText.startsWith("загадать мечту")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Мечта доступна только ребёнку в семье.");
        return;
      }

      const dreamText = originalText.slice("загадать мечту".length).trim();
      if (!dreamText || dreamText.length < 2) {
        await safeSendMessage(msg.chat.id, "❌ Напиши так:\nзагадать мечту айфон");
        return;
      }

      if (dreamText.length > MAX_DREAM_LENGTH) {
        await safeSendMessage(msg.chat.id, `❌ Мечта слишком длинная. Максимум ${MAX_DREAM_LENGTH} символов.`);
        return;
      }

      const dream = await setChildDream(msg.from.id, dreamText);

      let out = `🌟 ${getUserLink(msg.from)} загадал(а) мечту!

🎯 Мечта: ${escapeHtml(dream.dream_text)}
💰 Баланс на мечту: ${Number(dream.dream_balance || 0)}`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "моя мечта")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Мечта доступна только ребёнку в семье.");
        return;
      }

      const dream = await getChildDream(msg.from.id);
      if (!dream) {
        await safeSendMessage(msg.chat.id, "❌ У тебя пока нет мечты.\nНапиши: загадать мечту айфон");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🌠 Мечта ${getUserLink(msg.from)}

🎯 Мечта: ${escapeHtml(dream.dream_text)}
💰 Баланс на мечту: ${Number(dream.dream_balance || 0)}
🕒 Обновлена: ${formatDateTime(dream.updated_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "удалить мечту")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Мечта доступна только ребёнку в семье.");
        return;
      }

      const deleted = await deleteChildDream(msg.from.id);
      if (!deleted) {
        await safeSendMessage(msg.chat.id, "❌ У тебя нет мечты.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🗑 ${getUserLink(msg.from)} удалил(а) свою мечту.

💰 Монеты, которые были на мечте: ${Number(deleted.dream_balance || 0)}
ℹ️ Они удалены вместе с мечтой.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("пополнить баланс на мечту")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Команда доступна только ребёнку в семье.");
        return;
      }

      const match = lowerText.match(/^пополнить баланс на мечту\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      try {
        const result = await addSelfMoneyToDream(msg.from.id, amount);

        let out = `🌟 ${getUserLink(msg.from)} пополнил(а) баланс на мечту на ${amount} монет

🎯 Мечта: ${escapeHtml(result.dreamText)}
💰 Баланс мечты: ${result.dreamBalance}
👛 Твой баланс: ${result.userBalance}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_DREAM") {
          await safeSendMessage(msg.chat.id, "❌ У тебя нет мечты.\nНапиши: загадать мечту айфон");
          return;
        }

        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка пополнения баланса мечты:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка пополнения баланса на мечту.");
      }

      return;
    }

    if (lowerText.startsWith("на мечту")) {
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: на мечту 5 @username");
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^на мечту\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      try {
        const result = await addParentMoneyToDream(msg.from.id, target.id, amount);

        let out = `🎁 ${getUserLink(msg.from)} пополнил(а) мечту ${getUserLink(target)} на ${amount} монет

🎯 Мечта: ${escapeHtml(result.dreamText)}
💰 Баланс мечты: ${result.dreamBalance}
👛 Твой баланс: ${result.parentBalance}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NO_DREAM") {
          await safeSendMessage(msg.chat.id, "❌ У ребёнка нет мечты.");
          return;
        }

        if (error.message === "NOT_MY_CHILD") {
          await safeSendMessage(msg.chat.id, "❌ Это не ваш ребёнок.");
          return;
        }

        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка помощи на мечту:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка пополнения мечты.");
      }

      return;
    }

    if (lowerText.startsWith("попросить денег")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ У тебя нет родителей в семье.");
        return;
      }

      const punishmentText = await getPunishedBlockText(msg.from.id);
      if (punishmentText) {
        await safeSendMessage(msg.chat.id, `${punishmentText}\nВо время наказания нельзя просить деньги.`);
        return;
      }

      const match = lowerText.match(/^попросить денег\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      const parentUser = await getStoredUser(Number(childInfo.parent_user_id));
      const parentPartnerInfo = parentUser ? await getMarriagePartner(parentUser.id) : null;
      const secondParent = parentPartnerInfo
        ? await getStoredUser(Number(parentPartnerInfo.partnerId))
        : null;

      let parentsText = "";
      if (parentUser) parentsText += `${getUserLink(parentUser)}`;
      if (secondParent) parentsText += ` и ${getUserLink(secondParent)}`;

      await safeSendMessage(
        msg.chat.id,
        `👶 ${getUserLink(msg.from)} просит у родителей ${amount} монет.

👨‍👩‍👧 Родители: ${parentsText || "не найдены"}
💬 Родитель может ответить на сообщение ребёнка командой:
дать ребенку ${amount}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("дать ребенку")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение ребёнка или напиши: дать ребенку 5 @username");
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^дать ребенку\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      const childCheck = await assertChildInMyFamily(msg.from.id, target.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const punishmentText = await getPunishedBlockText(target.id);
      if (punishmentText) {
        await safeSendMessage(msg.chat.id, `${punishmentText}\nВо время наказания карманные деньги выдавать нельзя.`);
        return;
      }

      try {
        const transferResult = await transferCoins(msg.from.id, target.id, amount);

        let out = `💸 ${getUserLink(msg.from)} дал(а) ${getUserLink(target)} ${amount} монет

Баланс ${escapeHtml(getUserName(msg.from))}: ${transferResult.fromBalance}
Баланс ${escapeHtml(getUserName(target))}: ${transferResult.toBalance}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      } catch (error) {
        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У тебя недостаточно монет.");
          return;
        }

        console.error("Ошибка выдачи денег ребёнку:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка перевода монет ребёнку.");
      }

      return;
    }

    if (lowerText.startsWith("карманные деньги")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const sender = msg.from;
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение своего ребёнка или напиши: карманные деньги 50 @username");
        return;
      }

      const match = normalizeText(cleanupTextWithoutMention(originalText)).match(/^карманные деньги\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.");
        return;
      }

      const childCheck = await assertChildInMyFamily(sender.id, target.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
        return;
      }

      const punishmentText = await getPunishedBlockText(target.id);
      if (punishmentText) {
        await safeSendMessage(msg.chat.id, `${punishmentText}\nВо время наказания карманные деньги выдавать нельзя.`);
        return;
      }

      try {
        const transferResult = await transferCoins(sender.id, target.id, amount);

        let out = `💸 ${getUserLink(sender)} дал(а) ${getUserLink(target)} ${amount} монет

Баланс ${escapeHtml(getUserName(sender))}: ${transferResult.fromBalance}
Баланс ${escapeHtml(getUserName(target))}: ${transferResult.toBalance}`;

        out = await appendLevelUpIfNeeded(out, sender.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
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

    if (isExactCommand(lowerText, "брак") || isExactCommand(lowerText, "зарегистрироваться в брак")) {
      const sender = msg.from;
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или напиши: брак @username");
        return;
      }

      await initUser(target);

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

      if (sent) request.requestMessageId = sent.message_id;
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
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока или напиши: усыновить @username");
        return;
      }

      await initUser(child);

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

      if (sent) request.requestMessageId = sent.message_id;
      return;
    }

    if (isExactCommand(lowerText, "отказаться от ребенка")) {
      const parent = msg.from;
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение ребёнка или напиши: отказаться от ребенка @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
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
      const child = await resolveTargetUserUniversal(msg);

      if (!child) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение своего ребёнка или напиши: любимый ребенок @username");
        return;
      }

      const childCheck = await assertChildInMyFamily(parent.id, child.id);
      if (!childCheck.ok) {
        await safeSendMessage(msg.chat.id, childCheck.text);
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
        const punishment = await getActivePunishment(targetUser.id);
        const obedience = await getChildObedience(targetUser.id);

        let textFamily = `🏡 Семья

👶 Ребёнок: ${getUserLink(targetUser)}
👨 Родитель: ${getUserLink(parentUser)}`;

        if (secondParent) {
          textFamily += `\n👩 Второй родитель: ${getUserLink(secondParent)}`;
        }

        textFamily += `\n📅 В семье с: ${formatDate(childInfo.created_at)}`;
        textFamily += `\n📈 Послушание: ${Number(obedience?.value || 0)}/100`;

        if (punishment) {
          const remaining = new Date(punishment.until_at).getTime() - Date.now();
          textFamily += `\n\n⛔ Наказание: активно`;
          textFamily += `\n🕒 До: ${formatDateTime(punishment.until_at)}`;
          textFamily += `\n⏳ Осталось: ${formatRemainingTime(remaining)}`;
        } else {
          textFamily += `\n\n⛔ Наказание: нет`;
        }

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
        const coupleState = await getCoupleState(targetUser.id, partnerInfo.partnerId);
        familyText += `\n💍 Супруг(а): ${getUserLink(partnerUser)}`;
        familyText += `\n📅 Брак с: ${formatDate(partnerInfo.marriage.created_at)}`;
        familyText += `\n💚 Ревность: ${Number(coupleState?.jealousy || 0)}/100`;
      }

      if (children.length) {
        const favoriteChild = await getFavoriteChild(targetUser.id);
        const favoriteChildId = favoriteChild ? Number(favoriteChild.child_user_id) : null;

        const childLines = [];
        for (const childRow of children) {
          const childUser = await getStoredUser(Number(childRow.child_user_id));
          const childId = Number(childRow.child_user_id);
          const punishment = await getActivePunishment(childId);
          const obedience = await getChildObedience(childId);

          let line = "";
          if (favoriteChildId && favoriteChildId === childId) {
            line += `⭐ ${getUserLink(childUser)} — любимый`;
          } else {
            line += `• ${getUserLink(childUser)}`;
          }

          line += `\n   📈 Послушание: ${Number(obedience?.value || 0)}/100`;

          if (punishment) {
            const remaining = new Date(punishment.until_at).getTime() - Date.now();
            line += `\n   ⛔ Наказан(а)`;
            line += `\n   ⏳ Осталось: ${formatRemainingTime(remaining)}`;
          }

          childLines.push(line);
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

    // JAIL COMMANDS
    if (isExactCommand(lowerText, "тюрьма")) {
      let targetUser = msg.from;

      if (msg.reply_to_message) {
        const resolved = await resolveTargetUserFromReply(msg);
        if (resolved) targetUser = resolved;
      }

      const jail = await getJailStatus(targetUser.id);
      if (!jail) {
        await safeSendMessage(
          msg.chat.id,
          `✅ ${getUserLink(targetUser)} не в тюрьме.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const remainingMs = new Date(jail.until_at).getTime() - Date.now();

      await safeSendMessage(
        msg.chat.id,
        `🚔 Тюрьма

Игрок: ${getUserLink(targetUser)}
🕒 До: ${formatDateTime(jail.until_at)}
⏳ Осталось: ${formatRemainingTime(remainingMs)}

Доступно:
• репутация
• сбежать из тюрьмы
• адвокат
• подкупить охрану
• молиться
• отсидеть`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "молиться")) {
      const jail = await getJailStatus(msg.from.id);
      if (!jail) {
        await safeSendMessage(msg.chat.id, "🙏 Молиться можно только в тюрьме.");
        return;
      }

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_pray_at, JAIL_PRAY_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Снова молиться можно через ${formatRemainingTime(remainingCd)}`
        );
        return;
      }

      await setJailActionUsed(msg.from.id, "last_pray_at");
      await incrementReputationField(msg.from.id, "prayers_count", 1);

      const roll = Math.random();

      if (roll < 0.15) {
        await removeUserFromJail(msg.from.id);
        await changeWantedLevel(msg.from.id, -1);

        let out = `🙏 ${getUserLink(msg.from)} долго молился в камере...

✨ Произошло чудо — игрок освобождён из тюрьмы.`;
        out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (roll < 0.65) {
        const reduceMs = (8 + Math.floor(Math.random() * 11)) * 60 * 1000;
        const updatedJail = await reduceJailTime(msg.from.id, reduceMs);

        let out = `🙏 ${getUserLink(msg.from)} молился в тюрьме...

⏳ Срок уменьшен на ${formatRemainingTime(reduceMs)}
🕒 Новый срок до: ${formatDateTime(updatedJail.until_at)}`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 3);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `🙏 ${getUserLink(msg.from)} молился в тюрьме...

Ничего не произошло, но стало чуть спокойнее.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "отсидеть")) {
      const jail = await getJailStatus(msg.from.id);
      if (!jail) {
        await safeSendMessage(msg.chat.id, "✅ Ты не в тюрьме.");
        return;
      }

      const remainingMs = new Date(jail.until_at).getTime() - Date.now();

      await safeSendMessage(
        msg.chat.id,
        `🪑 ${getUserLink(msg.from)} решил(а) спокойно отсидеть срок.

⏳ До освобождения: ${formatRemainingTime(remainingMs)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "сбежать из тюрьмы")) {
      const jail = await getJailStatus(msg.from.id);
      if (!jail) {
        await safeSendMessage(msg.chat.id, "✅ Ты не в тюрьме.");
        return;
      }

      const bonuses = await getCrimeBonuses(msg.from.id);
      const wanted = await getWantedRow(msg.from.id);

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_escape_at, JAIL_ESCAPE_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Снова попробовать сбежать можно через ${formatRemainingTime(remainingCd)}`);
        return;
      }

      await setJailActionUsed(msg.from.id, "last_escape_at");

      const outcome = getRandomEscapeOutcome(wanted?.level || 0, bonuses.armor, bonuses.fakePassport);

      if (outcome.type === "success") {
        await removeUserFromJail(msg.from.id);
        await changeWantedLevel(msg.from.id, 1);
        await incrementReputationField(msg.from.id, "successful_escapes", 1);

        let out = `🏃 ${getUserLink(msg.from)} совершил(а) побег из тюрьмы!

🔓 Побег удался. Шанс был примерно 50 на 50.`;
        out = await appendLevelUpIfNeeded(out, msg.from.id, 8);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (outcome.type === "fail") {
        await incrementReputationField(msg.from.id, "failed_escapes", 1);

        await safeSendMessage(
          msg.chat.id,
          `🚫 Побег не удался.

👮 Охрана заметила попытку, но срок не увеличился.
Попробовать снова можно позже.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await incrementReputationField(msg.from.id, "failed_escapes", 1);

      const updatedJail = await extendJailTime(msg.from.id, outcome.extraMs);
      await changeWantedLevel(msg.from.id, 1);

      await safeSendMessage(
        msg.chat.id,
        `⛓ ${getUserLink(msg.from)} попытался(ась) сбежать, но был(а) пойман(а).

➕ Срок увеличен на 20 минут.
🕒 Новый срок до: ${formatDateTime(updatedJail.until_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "адвокат")) {
      const jail = await getJailStatus(msg.from.id);
      if (!jail) {
        await safeSendMessage(msg.chat.id, "✅ Ты не в тюрьме.");
        return;
      }

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_lawyer_at, JAIL_LAWYER_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Снова вызвать адвоката можно через ${formatRemainingTime(remainingCd)}`);
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if (Number(stats?.balance || 0) < JAIL_LAWYER_COST) {
        await safeSendMessage(msg.chat.id, `❌ Для адвоката нужно ${JAIL_LAWYER_COST} монет.`);
        return;
      }

      await deductCoinsSafe(msg.from.id, JAIL_LAWYER_COST);
      await setJailActionUsed(msg.from.id, "last_lawyer_at");
      await incrementReputationField(msg.from.id, "lawyer_uses", 1);

      const outcome = getRandomLawyerOutcome();

      if (outcome.type === "free") {
        await removeUserFromJail(msg.from.id);
        await changeWantedLevel(msg.from.id, -2);

        let out = `⚖️ ${getUserLink(msg.from)} нанял(а) адвоката за ${JAIL_LAWYER_COST} монет.

✅ Адвокат добился освобождения!`;
        out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (outcome.type === "reduce") {
        const updatedJail = await reduceJailTime(msg.from.id, outcome.reduceMs);
        await changeWantedLevel(msg.from.id, -1);

        await safeSendMessage(
          msg.chat.id,
          `⚖️ ${getUserLink(msg.from)} нанял(а) адвоката за ${JAIL_LAWYER_COST} монет.

📉 Срок уменьшен на ${formatRemainingTime(outcome.reduceMs)}
🕒 Новый срок до: ${formatDateTime(updatedJail.until_at)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `⚖️ ${getUserLink(msg.from)} нанял(а) адвоката за ${JAIL_LAWYER_COST} монет.

❌ Адвокат ничего не смог сделать.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "подкупить охрану")) {
      const jail = await getJailStatus(msg.from.id);
      if (!jail) {
        await safeSendMessage(msg.chat.id, "✅ Ты не в тюрьме.");
        return;
      }

      const bonuses = await getCrimeBonuses(msg.from.id);
      const wanted = await getWantedRow(msg.from.id);

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_bribe_at, JAIL_BRIBE_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Снова пробовать подкуп можно через ${formatRemainingTime(remainingCd)}`);
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if (Number(stats?.balance || 0) < JAIL_BRIBE_COST) {
        await safeSendMessage(msg.chat.id, `❌ Для подкупа охраны нужно ${JAIL_BRIBE_COST} монет.`);
        return;
      }

      await deductCoinsSafe(msg.from.id, JAIL_BRIBE_COST);
      await setJailActionUsed(msg.from.id, "last_bribe_at");
      await incrementReputationField(msg.from.id, "bribe_uses", 1);

      const outcome = getRandomBribeOutcome(wanted?.level || 0, bonuses.fakePassport);

      if (outcome.type === "free") {
        await removeUserFromJail(msg.from.id);
        await changeWantedLevel(msg.from.id, 1);

        let out = `💸 ${getUserLink(msg.from)} подкупил(а) охрану за ${JAIL_BRIBE_COST} монет.

🔓 Его тихо выпустили из тюрьмы.`;
        out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (outcome.type === "fail") {
        await changeWantedLevel(msg.from.id, 1);

        await safeSendMessage(
          msg.chat.id,
          `💸 ${getUserLink(msg.from)} попытался(ась) подкупить охрану.

❌ Деньги взяли, но выпускать не стали.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const updatedJail = await extendJailTime(msg.from.id, outcome.extraMs);
      await changeWantedLevel(msg.from.id, 1);

      await safeSendMessage(
        msg.chat.id,
        `🚨 Попытка подкупа раскрыта.

⛓ Срок увеличен на 25 минут.
🕒 Новый срок до: ${formatDateTime(updatedJail.until_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // MONEY GAMES
    if (isExactCommand(lowerText, "деньги") || isExactCommand(lowerText, "монеты")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

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

      let out = `💰 ${getUserLink(msg.from)}, вы получили ${result.coins} монет!

Баланс: ${result.balance} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "охота")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

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

      let out = `🏹 ${getUserLink(msg.from)} отправился на охоту...

${escapeHtml(result.hunt.text)}
${coinsLine}

Баланс: ${result.balance} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 7);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "снайпер")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

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

      let out = `🎯 ${getUserLink(msg.from)} прицелился...

${escapeHtml(result.sniper.text)}
${coinsLine}

Баланс: ${result.balance} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 6);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "баскетбол")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const result = await runBasketball(msg.from.id);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, баскетбол снова будет доступен через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      let coinsLine = "😐 0 монет";
      if (result.game.coins > 0) coinsLine = `💰 +${result.game.coins} монет`;
      if (result.game.coins < 0) coinsLine = `💸 ${result.game.coins} монет`;

      let out = `🏀 ${getUserLink(msg.from)} бросил(а) мяч в кольцо

${escapeHtml(result.game.text)}
${coinsLine}

Баланс: ${result.balance} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "боулинг")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const precheck = await runBowling(msg.from.id);

      if (!precheck.ok) {
        if (precheck.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, боулинг снова будет доступен через ${escapeHtml(formatRemainingTime(precheck.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await updateCooldownColumnNow(msg.from.id, "last_bowling_at");

      const diceMessage = await bot.sendDice(msg.chat.id, {
        emoji: "🎳",
        reply_to_message_id: msg.message_id
      });

      const diceValue = Number(diceMessage?.dice?.value || 0);
      const game = getBowlingResultByDiceValue(diceValue);

      const stats = await getUserStats(msg.from.id);
      let newBalance = Number(stats?.balance || 0) + Number(game.coins || 0);
      if (newBalance < 0) newBalance = 0;

      const updated = await pool.query(
        `UPDATE users SET balance = $2 WHERE user_id = $1 RETURNING balance`,
        [msg.from.id, newBalance]
      );

      let coinsLine = "😐 0 монет";
      if (game.coins > 0) coinsLine = `💰 +${game.coins} монет`;
      if (game.coins < 0) coinsLine = `💸 ${game.coins} монет`;

      let out = `🎳 ${getUserLink(msg.from)} сыграл(а) в боулинг

${escapeHtml(game.text)}
${coinsLine}

Баланс: ${Number(updated.rows[0]?.balance || 0)} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (
      lowerText === "кнб камень" ||
      lowerText === "кнб ножницы" ||
      lowerText === "кнб бумага"
    ) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const playerChoice = lowerText.replace("кнб ", "").trim();
      const result = await runKnb(msg.from.id, playerChoice);

      if (!result.ok) {
        if (result.reason === "not_found") {
          await safeSendMessage(msg.chat.id, "Ошибка профиля. Попробуй ещё раз.");
          return;
        }

        await safeSendMessage(
          msg.chat.id,
          `⏳ ${getUserLink(msg.from)}, КНБ снова будет доступно через ${escapeHtml(formatRemainingTime(result.remainingMs))}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      let coinsLine = "😐 0 монет";
      if (result.game.coins > 0) coinsLine = `💰 +${result.game.coins} монет`;
      if (result.game.coins < 0) coinsLine = `💸 ${result.game.coins} монет`;

      let out = `✂️ КНБ

👤 Ты: ${escapeHtml(playerChoice)}
🤖 Бот: ${escapeHtml(result.botChoice)}

${escapeHtml(result.game.text)}
${coinsLine}

Баланс: ${result.balance} монет`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 4);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // ROBBERY
    if (lowerText.startsWith("ограбить")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const childPunishment = await getPunishedBlockText(msg.from.id);
      if (childPunishment) {
        await safeSendMessage(msg.chat.id, `${childPunishment}\nВо время наказания нельзя грабить других.`);
        return;
      }

      const target = await resolveTargetUserUniversal(msg);
      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока или напиши: ограбить @username");
        return;
      }

      if (Number(target.id) === Number(msg.from.id)) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя ограбить самого себя.");
        return;
      }

      const robberyCooldown = await getRobberyCooldown(msg.from.id);
      if (robberyCooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Ограбление снова будет доступно через ${formatRemainingTime(robberyCooldown)}`);
        return;
      }

      const targetShield = await getShieldRow(target.id);
      if (Number(targetShield?.count || 0) > 0) {
        const shieldUse = await useShieldOnce(target.id);
        await updateCooldownColumnNow(msg.from.id, "last_robbery_at");

        await safeSendMessage(
          msg.chat.id,
          `🛡 ${getUserLink(target)} защитился(ась) щитом!

🕵️ ${getUserLink(msg.from)} не смог(ла) ограбить цель.
🛡 Осталось щитов у цели: ${shieldUse.count}/${MAX_SHIELDS}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        await incrementReputationField(msg.from.id, "failed_robberies", 1);
        return;
      }

      const targetStats = await getUserStats(target.id);
      if (!targetStats || Number(targetStats.balance || 0) <= 0) {
        await safeSendMessage(msg.chat.id, "❌ У этого игрока нет монет. Грабить нечего.");
        return;
      }

      const myWanted = await getWantedRow(msg.from.id);
      const bonuses = await getCrimeBonuses(msg.from.id);

      await updateCooldownColumnNow(msg.from.id, "last_robbery_at");

      const robbery = getRandomRobberyResult(Number(targetStats.balance || 0), myWanted?.level || 0, bonuses);

      if (robbery.type === "fail") {
        await incrementReputationField(msg.from.id, "failed_robberies", 1);

        let resultText = `🚨 ${getUserLink(msg.from)} попытался ограбить ${getUserLink(target)}, но его спалили!`;

        const failFine = Math.floor(Math.random() * 6) + 3;
        try {
          const fineResult = await deductCoinsSafe(msg.from.id, failFine);
          if (fineResult.deducted > 0) {
            resultText += `\n💸 Штраф за провал: ${fineResult.deducted} монет`;
          }
        } catch (error) {
          console.error("Ошибка штрафа за провал ограбления:", error);
        }

        await changeWantedLevel(msg.from.id, 1);

        const police = getRandomPoliceOutcome(myWanted?.level || 0);

        if (police.type === "fine") {
          try {
            const fine = await deductCoinsSafe(msg.from.id, police.amount);
            if (fine.deducted > 0) {
              resultText += `\n🚓 Полиция поймала преступника.\n💸 Полицейский штраф: ${fine.deducted} монет`;
            }
          } catch (error) {
            console.error("Ошибка police fine:", error);
          }
        }

        if (police.type === "jail") {
          const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
          await changeWantedLevel(msg.from.id, 1);
          await deactivateLayLow(msg.from.id);
          resultText += `\n🚔 ${getUserLink(msg.from)} арестован(а) и отправлен(а) в тюрьму!`;
          resultText += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
        }

        await safeSendMessage(msg.chat.id, resultText, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      let transfer;
      try {
        transfer = await robberyTransfer(msg.from.id, target.id, robbery.amount);
      } catch (error) {
        if (error.message === "VICTIM_NO_MONEY") {
          await safeSendMessage(msg.chat.id, "❌ У этого игрока нет монет. Грабить нечего.");
          return;
        }

        console.error("Ошибка robberyTransfer:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка ограбления.");
        return;
      }

      await incrementReputationField(msg.from.id, "successful_robberies", 1);
      await changeWantedLevel(msg.from.id, 1);

      let resultText = robbery.type === "small"
        ? `🕵️ ${getUserLink(msg.from)} ограбил(а) ${getUserLink(target)} и украл(а) ${transfer.stolen} монет`
        : `💰 ${getUserLink(msg.from)} удачно ограбил(а) ${getUserLink(target)} и вынес(ла) ${transfer.stolen} монет!`;

      const police = getRandomPoliceOutcome(myWanted?.level || 0);

      if (police.type === "fine") {
        try {
          const fine = await deductCoinsSafe(msg.from.id, police.amount);
          if (fine.deducted > 0) {
            resultText += `\n🚓 Но полиция вычислила вора.`;
            resultText += `\n💸 Штраф: ${fine.deducted} монет`;
          }
        } catch (error) {
          console.error("Ошибка police fine after success:", error);
        }
      }

      if (police.type === "return") {
        try {
          await transferCoins(msg.from.id, target.id, transfer.stolen);
          resultText += `\n🚓 Полиция быстро нашла вора и вернула ${transfer.stolen} монет владельцу.`;
        } catch (error) {
          console.error("Ошибка возврата денег полицией:", error);
        }
      }

      if (police.type === "jail") {
        const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
        await changeWantedLevel(msg.from.id, 1);
        await deactivateLayLow(msg.from.id);
        resultText += `\n🚔 Полиция задержала ${getUserLink(msg.from)}!`;
        resultText += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
      }

      resultText = await appendLevelUpIfNeeded(resultText, msg.from.id, 10);

      await safeSendMessage(msg.chat.id, resultText, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // ATM HACK
    if (isExactCommand(lowerText, "взлом банкомата")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const cooldown = await getAtmHackCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Взлом банкомата снова будет доступен через ${formatRemainingTime(cooldown)}`);
        return;
      }

      const bonuses = await getCrimeBonuses(msg.from.id);
      if (!bonuses.lockpick) {
        await safeSendMessage(msg.chat.id, "❌ Для взлома банкомата нужна отмычка.\nКупи её на чёрном рынке.");
        return;
      }

      const wanted = await getWantedRow(msg.from.id);
      await updateCooldownColumnNow(msg.from.id, "last_atm_hack_at");

      const outcome = getAtmHackOutcome(wanted?.level || 0, bonuses);

      if (outcome.type === "fail") {
        await incrementReputationField(msg.from.id, "failed_atm_hacks", 1);
        await changeWantedLevel(msg.from.id, 1);

        let out = `🏧 Попытка взлома банкомата провалилась.

🚨 Банкомат заблокировался
📹 Камера записала лицо`;

        if (Math.random() < 0.55) {
          const fine = await deductCoinsSafe(msg.from.id, Math.floor(Math.random() * 10) + 8);
          if (fine.deducted > 0) out += `\n💸 Штраф: ${fine.deducted} монет`;
        }

        const police = getRandomPoliceOutcome(wanted?.level || 0);
        if (police.type === "jail") {
          const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
          await changeWantedLevel(msg.from.id, 1);
          out += `\n🚔 Полиция задержала тебя.`;
          out += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
        }

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      await incrementReputationField(msg.from.id, "successful_atm_hacks", 1);
      await changeWantedLevel(msg.from.id, 1);
      const newBalance = await addCoinsToUser(msg.from.id, outcome.coins);

      let out = `🏧 ${getUserLink(msg.from)} взломал(а) банкомат.

💰 Получено: ${outcome.coins} монет
🚨 Розыск +1
👛 Баланс: ${newBalance}`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 9);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // JEWELRY HEIST
    if (isExactCommand(lowerText, "ограбление ювелирки")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const childPunishment = await getPunishedBlockText(msg.from.id);
      if (childPunishment) {
        await safeSendMessage(msg.chat.id, `${childPunishment}\nВо время наказания нельзя грабить ювелирку.`);
        return;
      }

      const cooldown = await getJewelryCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Ограбление ювелирки снова будет доступно через ${formatRemainingTime(cooldown)}`);
        return;
      }

      const bonuses = await getCrimeBonuses(msg.from.id);
      const wanted = await getWantedRow(msg.from.id);

      await updateCooldownColumnNow(msg.from.id, "last_jewelry_at");

      const outcome = getJewelryHeistOutcome(wanted?.level || 0, bonuses);

      if (outcome.type === "fail" || outcome.type === "disaster") {
        await incrementReputationField(msg.from.id, "failed_jewelry_heists", 1);
        await changeWantedLevel(msg.from.id, 2);

        let out = `💎 ${getUserLink(msg.from)} попытался(ась) ограбить ювелирку, но всё пошло не по плану.

🚨 Сработала тревога
📹 Камеры записали преступника`;

        if (outcome.type === "disaster") {
          out += `\n🔒 Магазин мгновенно заблокировался`;
        }

        const police = getRandomPoliceOutcome((wanted?.level || 0) + 1);

        if (police.type === "fine") {
          const fine = await deductCoinsSafe(msg.from.id, Math.floor(Math.random() * 16) + 10);
          if (fine.deducted > 0) {
            out += `\n💸 Штраф: ${fine.deducted} монет`;
          }
        }

        if (police.type === "jail" || outcome.type === "disaster") {
          const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
          await changeWantedLevel(msg.from.id, 1);
          out += `\n🚔 Полиция арестовала преступника.`;
          out += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
        }

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      await incrementReputationField(msg.from.id, "successful_jewelry_heists", 1);
      await changeWantedLevel(msg.from.id, 2);
      const newBalance = await addCoinsToUser(msg.from.id, outcome.coins);

      let intro = "💎 Ювелирка ограблена!";
      if (outcome.type === "jackpot") intro = "💎💰 Идеальное ограбление ювелирки!";
      if (outcome.type === "big") intro = "💎 Крупная добыча из ювелирки!";

      let out = `${intro}

👤 Игрок: ${getUserLink(msg.from)}
💰 Добыча: ${outcome.coins} монет
🚨 Розыск +2
👛 Баланс: ${newBalance}`;

      const police = getRandomPoliceOutcome((wanted?.level || 0) + 1);
      if (police.type === "fine") {
        const fine = await deductCoinsSafe(msg.from.id, Math.floor(Math.random() * 12) + 8);
        if (fine.deducted > 0) {
          out += `\n🚓 Полиция начала преследование.`;
          out += `\n💸 Штраф: ${fine.deducted} монет`;
        }
      }

      if (police.type === "jail" && Math.random() < 0.35) {
        const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
        await changeWantedLevel(msg.from.id, 1);
        out += `\n🚔 После побега тебя всё же задержали.`;
        out += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
      }

      out = await appendLevelUpIfNeeded(out, msg.from.id, 11);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // BANK HEIST COMMANDS
    if (isExactCommand(lowerText, "ограбление банка")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const existingHeist = getBankHeist(msg.chat.id);
      if (existingHeist) {
        await safeSendMessage(msg.chat.id, "❌ В этом чате уже есть активное ограбление банка.");
        return;
      }

      const cooldown = await getBankHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Ограбление банка снова будет доступно через ${formatRemainingTime(cooldown)}`);
        return;
      }

      createBankHeist(msg.chat.id, msg.from);

      let out = `🏦 ${getUserLink(msg.from)} начал(а) подготовку к ограблению банка!

👑 Лидер: ${getUserLink(msg.from)}
👥 Сейчас в команде: 1/${BANK_HEIST_MAX_MEMBERS}
🎯 Нужно минимум ${BANK_HEIST_MIN_MEMBERS} игрока

Дальше:
• присоединиться к ограблению
• в дело
• статус ограбления
• начать штурм

💡 Маска, рация, бронежилет и глушилка сильно помогают.`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 8);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "присоединиться к ограблению") || isExactCommand(lowerText, "в дело")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ В этом чате нет активного ограбления банка.");
        return;
      }

      if (heist.stage !== "gathering") {
        await safeSendMessage(msg.chat.id, "❌ Ограбление уже началось. Присоединиться поздно.");
        return;
      }

      if (isHeistParticipant(heist, msg.from.id)) {
        await safeSendMessage(msg.chat.id, "✅ Ты уже в команде.");
        return;
      }

      if (getHeistMemberCount(heist) >= BANK_HEIST_MAX_MEMBERS) {
        await safeSendMessage(msg.chat.id, `❌ Команда уже полная. Максимум ${BANK_HEIST_MAX_MEMBERS} игроков.`);
        return;
      }

      const cooldown = await getBankHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Ты ещё не можешь участвовать в новом ограблении банка.\nОсталось: ${formatRemainingTime(cooldown)}`);
        return;
      }

      heist.members[String(msg.from.id)] = {
        id: Number(msg.from.id),
        first_name: msg.from.first_name || "",
        last_name: msg.from.last_name || "",
        username: msg.from.username || ""
      };

      let out = `👥 ${getUserLink(msg.from)} присоединился(ась) к ограблению банка!

Команда: ${getHeistMemberCount(heist)}/${BANK_HEIST_MAX_MEMBERS}
Лидер: ${getUserLink(heist.members[String(heist.leaderId)])}

Теперь можно:
• статус ограбления
• начать штурм`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "статус ограбления")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      const stats = await getHeistTeamStats(heist);
      const membersText = getHeistMembersList(heist)
        .map((u, i) => `${i + 1}. ${Number(u.id) === Number(heist.leaderId) ? "👑 " : ""}${getUserLink(u)}`)
        .join("\n");

      await safeSendMessage(
        msg.chat.id,
        `🏦 Ограбление банка

Этап: ${escapeHtml(heist.stage)}
👥 Команда: ${stats.members}/${BANK_HEIST_MAX_MEMBERS}
🎭 Маски: ${stats.masks}
📡 Рации: ${stats.radios}
🦺 Бронежилеты: ${stats.armors}
📴 Глушилки: ${stats.jammers}
🔑 Отмычки: ${stats.lockpicks}
🚨 Полиция: ${heist.policeAlert ? "уже настороже" : "пока тихо"}
💰 Общая добыча: ${Number(heist.loot || 0)} монет

Участники:
${membersText}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "отменить ограбление")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      if (Number(msg.from.id) !== Number(heist.leaderId)) {
        await safeSendMessage(msg.chat.id, "❌ Только лидер может отменить ограбление.");
        return;
      }

      if (heist.stage !== "gathering") {
        await safeSendMessage(msg.chat.id, "❌ Ограбление уже началось. Отменить поздно.");
        return;
      }

      clearBankHeist(msg.chat.id);

      await safeSendMessage(
        msg.chat.id,
        `🛑 ${getUserLink(msg.from)} отменил(а) подготовку к ограблению банка.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "начать штурм")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      if (Number(msg.from.id) !== Number(heist.leaderId)) {
        await safeSendMessage(msg.chat.id, "❌ Только лидер может начать штурм.");
        return;
      }

      if (heist.stage !== "gathering") {
        await safeSendMessage(msg.chat.id, "❌ Штурм уже начат.");
        return;
      }

      const members = getHeistMembersList(heist);
      if (members.length < BANK_HEIST_MIN_MEMBERS) {
        await safeSendMessage(msg.chat.id, `❌ Для ограбления банка нужно минимум ${BANK_HEIST_MIN_MEMBERS} игрока.`);
        return;
      }

      for (const user of members) {
        const jail = await getJailStatus(user.id);
        if (jail) {
          await safeSendMessage(msg.chat.id, `❌ ${getUserLink(user)} сейчас в тюрьме.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          return;
        }

        const layLow = await getLayLowStatus(user.id);
        if (layLow && layLow.is_active) {
          const remain = new Date(layLow.until_at).getTime() - Date.now();
          await safeSendMessage(msg.chat.id, `❌ ${getUserLink(user)} сейчас залёг на дно.\n⏳ Осталось: ${formatRemainingTime(remain)}`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          return;
        }
      }

      const stats = await getHeistTeamStats(heist);
      const entry = getBankEntryOutcome(stats);

      for (const user of members) {
        await changeWantedLevel(user.id, 1);
      }

      if (entry.type === "clean_success") {
        heist.stage = "inside";
        heist.policeAlert = Math.random() < 0.45;

        let out = `🏦 Команда проникла в банк почти без шума.

${heist.policeAlert ? "🚨 Но скрытая тревога уже отправила сигнал полиции." : "😶 Скрытая тревога пока не сработала."}

Следующая команда:
• вскрыть сейф`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 10);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (entry.type === "noisy_success") {
        heist.stage = "inside";
        heist.policeAlert = true;

        let out = `🚔 У входа стояла усиленная охрана.

Команда смогла прорваться внутрь, но:
🚨 нажата тревожная кнопка
📹 камеры зафиксировали движение
🚓 полиция уже едет

Следующая команда:
• вскрыть сейф`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 10);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (entry.type === "partial_fail_alarm") {
        heist.stage = "inside";
        heist.policeAlert = true;

        let out = `⚠️ На входе всё пошло криво, но команда всё же прорвалась внутрь.

🚨 Сработала тревога
📹 Камеры зафиксировали часть лиц
🚔 Полиция уже в пути

Следующая команда:
• вскрыть сейф`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 8);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      heist.stage = "failed";
      clearBankHeist(msg.chat.id);

      for (const user of members) {
        await updateCooldownColumnNow(user.id, "last_bank_at");
        await incrementReputationField(user.id, "failed_bank_heists", 1);
      }

      const shuffled = [...members].sort(() => Math.random() - 0.5);
      const arrested = shuffled.slice(0, members.length >= 3 ? 2 : 1);
      const fined = shuffled.slice(arrested.length);

      for (const user of arrested) {
        await sendUserToJail(user.id, POLICE_JAIL_MS);
        await changeWantedLevel(user.id, 1);
      }

      for (const user of fined) {
        try {
          await deductCoinsSafe(user.id, Math.floor(Math.random() * 31) + 20);
        } catch (error) {
          console.error("Ошибка штрафа банка:", error);
        }
      }

      await safeSendMessage(
        msg.chat.id,
        `🚔 Ограбление банка сорвалось ещё на входе!

Охрана заметила подготовку и нажала тревожную кнопку.

${arrested.length ? `⛓ Арестованы:\n${arrested.map((u) => `• ${getUserLink(u)}`).join("\n")}` : ""}
${fined.length ? `\n\n💸 Остальные ушли, но получили крупные штрафы.` : ""}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "вскрыть сейф")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      if (Number(msg.from.id) !== Number(heist.leaderId)) {
        await safeSendMessage(msg.chat.id, "❌ Только лидер может дать команду на вскрытие сейфа.");
        return;
      }

      if (heist.stage !== "inside") {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нельзя вскрывать сейф.");
        return;
      }

      const stats = await getHeistTeamStats(heist);
      const vault = getVaultOutcome(stats, heist.policeAlert);

      if (vault.type === "jackpot" || vault.type === "success" || vault.type === "medium" || vault.type === "small") {
        heist.loot = vault.loot;
        heist.stage = "escape";
        if (vault.type !== "jackpot") heist.policeAlert = true;

        let intro = "🗄 Сейф вскрыт!";
        if (vault.type === "jackpot") intro = "💰 Сейф вскрыт идеально!";
        if (vault.type === "medium") intro = "🗄 Сейф оказался с усиленной защитой.";
        if (vault.type === "small") intro = "⚠️ Сейф удалось открыть только частично.";

        let out = `${intro}

💰 Общая добыча: ${vault.loot} монет
🚔 Полиция: ${heist.policeAlert ? "уже на подходе" : "ещё не догнала"}

Следующая команда:
• сбежать с банка`;

        out = await appendLevelUpIfNeeded(out, msg.from.id, 8);

        await safeSendMessage(msg.chat.id, out, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        return;
      }

      if (vault.type === "fail_alarm") {
        heist.loot = 0;
        heist.stage = "escape";
        heist.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `🚨 Сейф не поддался!

💰 Добыча: 0 монет
🚔 Полиция уже рядом.

Последний шанс:
• сбежать с банка`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const members = getHeistMembersList(heist);
      clearBankHeist(msg.chat.id);

      for (const user of members) {
        await sendUserToJail(user.id, POLICE_JAIL_MS);
        await changeWantedLevel(user.id, 1);
        await updateCooldownColumnNow(user.id, "last_bank_at");
        await incrementReputationField(user.id, "failed_bank_heists", 1);
      }

      await safeSendMessage(
        msg.chat.id,
        `🚨 Во время вскрытия сейфа всё пошло очень плохо!

Сработала защита банка и полиция окружила здание.

⛓ Вся команда арестована:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "сбежать с банка")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      if (!isHeistParticipant(heist, msg.from.id)) {
        await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в команде этого ограбления.");
        return;
      }

      if (heist.stage !== "escape") {
        await safeSendMessage(msg.chat.id, "❌ Сейчас рано бежать.");
        return;
      }

      const stats = await getHeistTeamStats(heist);
      const outcome = getBankEscapeOutcome(stats, heist.loot, heist.policeAlert);
      const members = getHeistMembersList(heist);

      for (const user of members) {
        await updateCooldownColumnNow(user.id, "last_bank_at");
      }

      if (outcome.type === "full_escape") {
        const share = Math.floor(heist.loot / members.length);
        let leftover = heist.loot - share * members.length;
        const lines = [];

        for (const user of members) {
          let amount = share;
          if (leftover > 0) {
            amount += 1;
            leftover -= 1;
          }
          const newBalance = await addCoinsToUser(user.id, amount);
          await changeWantedLevel(user.id, 2);
          await incrementReputationField(user.id, "successful_bank_heists", 1);
          lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
        }

        clearBankHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🏃 Побег удался!

Команда смогла унести всю общую добычу: ${heist.loot} монет

Раздел добычи:
${lines.join("\n")}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "half_escape") {
        const savedLoot = Math.max(1, Math.floor(heist.loot * 0.45));
        const share = Math.floor(savedLoot / members.length);
        let leftover = savedLoot - share * members.length;
        const lines = [];

        for (const user of members) {
          let amount = share;
          if (leftover > 0) {
            amount += 1;
            leftover -= 1;
          }
          const newBalance = await addCoinsToUser(user.id, amount);
          await changeWantedLevel(user.id, 2);
          await incrementReputationField(user.id, "successful_bank_heists", 1);
          lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
        }

        clearBankHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🏃 Побег частично удался

Во время побега пришлось бросить часть денег.
Сохранено: ${savedLoot} из ${heist.loot} монет

Раздел добычи:
${lines.join("\n")}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "one_caught") {
        const shuffled = [...members].sort(() => Math.random() - 0.5);
        const caught = shuffled[0];
        const escaped = shuffled.slice(1);

        await sendUserToJail(caught.id, POLICE_JAIL_MS);
        await changeWantedLevel(caught.id, 1);
        await incrementReputationField(caught.id, "failed_bank_heists", 1);

        const savedLoot = Math.max(1, Math.floor(heist.loot * 0.40));
        let shareText = "";

        if (escaped.length) {
          const share = Math.floor(savedLoot / escaped.length);
          let leftover = savedLoot - share * escaped.length;
          const lines = [];

          for (const user of escaped) {
            let amount = share;
            if (leftover > 0) {
              amount += 1;
              leftover -= 1;
            }
            const newBalance = await addCoinsToUser(user.id, amount);
            await changeWantedLevel(user.id, 2);
            await incrementReputationField(user.id, "successful_bank_heists", 1);
            lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
          }

          shareText = lines.join("\n");
        }

        clearBankHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🚔 Побег удался не всем.

⛓ Пойман(а): ${getUserLink(caught)}
💰 Остальным удалось унести только ${savedLoot} монет

${shareText ? `Раздел добычи:\n${shareText}` : "Никто больше не ушёл с добычей."}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      clearBankHeist(msg.chat.id);

      for (const user of members) {
        await sendUserToJail(user.id, POLICE_JAIL_MS);
        await changeWantedLevel(user.id, 1);
        await incrementReputationField(user.id, "failed_bank_heists", 1);
      }

      await safeSendMessage(
        msg.chat.id,
        `🚔 Побег не удался.

Полиция догнала всю команду.

⛓ В тюрьму отправлены:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}

💰 Добыча потеряна.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // VAN HEIST COMMANDS
    if (isExactCommand(lowerText, "нападение на инкассацию")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const existing = getVanHeist(msg.chat.id);
      if (existing) {
        await safeSendMessage(msg.chat.id, "❌ В этом чате уже идёт подготовка к нападению на инкассацию.");
        return;
      }

      const cooldown = await getVanHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Нападение на инкассацию снова будет доступно через ${formatRemainingTime(cooldown)}`);
        return;
      }

      createVanHeist(msg.chat.id, msg.from);

      let out = `🚚 ${getUserLink(msg.from)} начал(а) подготовку к нападению на инкассацию!

👥 Сейчас в команде: 1/${VAN_HEIST_MAX_MEMBERS}
🎯 Нужно минимум ${VAN_HEIST_MIN_MEMBERS} игрока

Команды:
• присоединиться к инкассации
• начать перехват
• статус инкассации

💡 Маски, рации и бронежилеты очень важны.`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 8);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "присоединиться к инкассации")) {
      const jailText = await getJailBlockText(msg.from.id);
      if (jailText) {
        await safeSendMessage(msg.chat.id, jailText);
        return;
      }

      const layLowBlock = await getLayLowBlockText(msg.from.id);
      if (layLowBlock) {
        await safeSendMessage(msg.chat.id, layLowBlock);
        return;
      }

      const van = getVanHeist(msg.chat.id);
      if (!van) {
        await safeSendMessage(msg.chat.id, "❌ В этом чате нет активной подготовки к инкассации.");
        return;
      }

      if (van.stage !== "gathering") {
        await safeSendMessage(msg.chat.id, "❌ Нападение уже началось.");
        return;
      }

      if (isVanParticipant(van, msg.from.id)) {
        await safeSendMessage(msg.chat.id, "✅ Ты уже в команде.");
        return;
      }

      if (getVanMemberCount(van) >= VAN_HEIST_MAX_MEMBERS) {
        await safeSendMessage(msg.chat.id, `❌ Команда уже полная. Максимум ${VAN_HEIST_MAX_MEMBERS} игроков.`);
        return;
      }

      const cooldown = await getVanHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(msg.chat.id, `⏳ Ты ещё не можешь участвовать в новом нападении.\nОсталось: ${formatRemainingTime(cooldown)}`);
        return;
      }

      van.members[String(msg.from.id)] = {
        id: Number(msg.from.id),
        first_name: msg.from.first_name || "",
        last_name: msg.from.last_name || "",
        username: msg.from.username || ""
      };

      let out = `👥 ${getUserLink(msg.from)} присоединился(ась) к нападению на инкассацию!

Команда: ${getVanMemberCount(van)}/${VAN_HEIST_MAX_MEMBERS}
Дальше:
• начать перехват
• статус инкассации`;

      out = await appendLevelUpIfNeeded(out, msg.from.id, 5);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "статус инкассации")) {
      const van = getVanHeist(msg.chat.id);
      if (!van) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активной подготовки к инкассации.");
        return;
      }

      const stats = await getVanTeamStats(van);
      const membersText = getVanMembersList(van)
        .map((u, i) => `${i + 1}. ${Number(u.id) === Number(van.leaderId) ? "👑 " : ""}${getUserLink(u)}`)
        .join("\n");

      await safeSendMessage(
        msg.chat.id,
        `🚚 Инкассация

Этап: ${escapeHtml(van.stage)}
👥 Команда: ${stats.members}/${VAN_HEIST_MAX_MEMBERS}
🎭 Маски: ${stats.masks}
📡 Рации: ${stats.radios}
🦺 Бронежилеты: ${stats.armors}
📴 Глушилки: ${stats.jammers}
🚨 Полиция: ${van.policeAlert ? "уже настороже" : "пока тихо"}
💰 Общая добыча: ${Number(van.loot || 0)} монет

Участники:
${membersText}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "начать перехват")) {
      const van = getVanHeist(msg.chat.id);
      if (!van) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активной подготовки к инкассации.");
        return;
      }

      if (Number(msg.from.id) !== Number(van.leaderId)) {
        await safeSendMessage(msg.chat.id, "❌ Только лидер может начать перехват.");
        return;
      }

      if (van.stage !== "gathering") {
        await safeSendMessage(msg.chat.id, "❌ Перехват уже начат.");
        return;
      }

      const members = getVanMembersList(van);
      if (members.length < VAN_HEIST_MIN_MEMBERS) {
        await safeSendMessage(msg.chat.id, `❌ Для нападения нужно минимум ${VAN_HEIST_MIN_MEMBERS} игрока.`);
        return;
      }

      for (const user of members) {
        const jail = await getJailStatus(user.id);
        if (jail) {
          await safeSendMessage(msg.chat.id, `❌ ${getUserLink(user)} сейчас в тюрьме.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          return;
        }

        const layLow = await getLayLowStatus(user.id);
        if (layLow && layLow.is_active) {
          await safeSendMessage(msg.chat.id, `❌ ${getUserLink(user)} сейчас залёг на дно.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          return;
        }
      }

      van.stage = "intercept";
      van.policeAlert = Math.random() < 0.50;

      for (const user of members) {
        await changeWantedLevel(user.id, 1);
      }

      await safeSendMessage(
        msg.chat.id,
        `🚚 Машина инкассации замечена.

⚠️ Охрана вооружена
${van.policeAlert ? "🚨 Полиция уже получила подозрительный сигнал" : "😶 Пока полиция не поднята"}

Следующая команда:
• атаковать инкассацию`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "атаковать инкассацию")) {
      const van = getVanHeist(msg.chat.id);
      if (!van) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активной подготовки к инкассации.");
        return;
      }

      if (Number(msg.from.id) !== Number(van.leaderId)) {
        await safeSendMessage(msg.chat.id, "❌ Только лидер может начать атаку.");
        return;
      }

      if (van.stage !== "intercept") {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нельзя атаковать инкассацию.");
        return;
      }

      const stats = await getVanTeamStats(van);
      const outcome = getVanAttackOutcome(stats);

      if (outcome.type === "clean_success") {
        van.stage = "escape";
        van.loot = Math.floor(Math.random() * 41) + 55;
        van.policeAlert = Math.random() < 0.55;

        await safeSendMessage(
          msg.chat.id,
          `💰 Нападение на инкассацию удалось!

Добыча: ${van.loot} монет
${van.policeAlert ? "🚔 Полиция уже знает о нападении" : "😶 Полиция ещё не успела среагировать"}

Следующая команда:
• уйти с инкассацией`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "success_alarm") {
        van.stage = "escape";
        van.loot = Math.floor(Math.random() * 31) + 32;
        van.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `💰 Нападение на инкассацию частично удалось!

Добыча: ${van.loot} монет
🚨 Но охрана вызвала полицию.

Следующая команда:
• уйти с инкассацией`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "partial_fail") {
        van.stage = "escape";
        van.loot = Math.floor(Math.random() * 15) + 10;
        van.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `⚠️ Охрана оказалась слишком сильной.

Удалось забрать только ${van.loot} монет
🚔 Полиция уже рядом.

Следующая команда:
• уйти с инкассацией`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const members = getVanMembersList(van);
      clearVanHeist(msg.chat.id);

      for (const user of members) {
        await sendUserToJail(user.id, POLICE_JAIL_MS);
        await changeWantedLevel(user.id, 1);
        await updateCooldownColumnNow(user.id, "last_van_heist_at");
        await incrementReputationField(user.id, "failed_van_heists", 1);
      }

      await safeSendMessage(
        msg.chat.id,
        `🚨 Нападение на инкассацию провалилось!

Охрана отбилась, а полиция быстро окружила место.

⛓ Вся команда арестована:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "уйти с инкассацией")) {
      const van = getVanHeist(msg.chat.id);
      if (!van) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного нападения на инкассацию.");
        return;
      }

      if (!isVanParticipant(van, msg.from.id)) {
        await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в команде.");
        return;
      }

      if (van.stage !== "escape") {
        await safeSendMessage(msg.chat.id, "❌ Сейчас рано уходить.");
        return;
      }

      const stats = await getVanTeamStats(van);
      const outcome = getVanEscapeOutcome(stats, van.loot, van.policeAlert);
      const members = getVanMembersList(van);

      for (const user of members) {
        await updateCooldownColumnNow(user.id, "last_van_heist_at");
      }

      if (outcome.type === "full_escape") {
        const share = Math.floor(van.loot / members.length);
        let leftover = van.loot - share * members.length;
        const lines = [];

        for (const user of members) {
          let amount = share;
          if (leftover > 0) {
            amount += 1;
            leftover -= 1;
          }
          const newBalance = await addCoinsToUser(user.id, amount);
          await changeWantedLevel(user.id, 2);
          await incrementReputationField(user.id, "successful_van_heists", 1);
          lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
        }

        clearVanHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🏃 Команда смогла уйти после нападения на инкассацию!

Общая добыча: ${van.loot} монет

Раздел:
${lines.join("\n")}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "partial_escape") {
        const savedLoot = Math.max(1, Math.floor(van.loot * 0.45));
        const share = Math.floor(savedLoot / members.length);
        let leftover = savedLoot - share * members.length;
        const lines = [];

        for (const user of members) {
          let amount = share;
          if (leftover > 0) {
            amount += 1;
            leftover -= 1;
          }
          const newBalance = await addCoinsToUser(user.id, amount);
          await changeWantedLevel(user.id, 2);
          await incrementReputationField(user.id, "successful_van_heists", 1);
          lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
        }

        clearVanHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🏃 Команда ушла неидеально.

Сохранено только ${savedLoot} из ${van.loot} монет

Раздел:
${lines.join("\n")}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "one_caught") {
        const shuffled = [...members].sort(() => Math.random() - 0.5);
        const caught = shuffled[0];
        const escaped = shuffled.slice(1);

        await sendUserToJail(caught.id, POLICE_JAIL_MS);
        await changeWantedLevel(caught.id, 1);
        await incrementReputationField(caught.id, "failed_van_heists", 1);

        const savedLoot = Math.max(1, Math.floor(van.loot * 0.40));
        let shareText = "";

        if (escaped.length) {
          const share = Math.floor(savedLoot / escaped.length);
          let leftover = savedLoot - share * escaped.length;
          const lines = [];

          for (const user of escaped) {
            let amount = share;
            if (leftover > 0) {
              amount += 1;
              leftover -= 1;
            }
            const newBalance = await addCoinsToUser(user.id, amount);
            await changeWantedLevel(user.id, 2);
            await incrementReputationField(user.id, "successful_van_heists", 1);
            lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
          }

          shareText = lines.join("\n");
        }

        clearVanHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🚔 После нападения на инкассацию поймали одного участника.

⛓ Пойман(а): ${getUserLink(caught)}
💰 Остальные вынесли ${savedLoot} монет

${shareText ? `Раздел:\n${shareText}` : "Никто больше не ушёл с добычей."}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      clearVanHeist(msg.chat.id);

      for (const user of members) {
        await sendUserToJail(user.id, POLICE_JAIL_MS);
        await changeWantedLevel(user.id, 1);
        await incrementReputationField(user.id, "failed_van_heists", 1);
      }

      await safeSendMessage(
        msg.chat.id,
        `🚔 После нападения на инкассацию полиция задержала всю команду.

⛓ Арестованы:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}

💰 Добыча потеряна.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // SHOP
    if (isExactCommand(lowerText, "купить монеты")) {
      await safeSendMessage(
        msg.chat.id,
        `🛒 Покупка монет

Товар:
💰 50 монет — 5 ⭐
💰 100 монет — 10 ⭐
💰 200 монет — 20 ⭐
💰 300 монет — 30 ⭐`,
        { reply_markup: getShopKeyboard() }
      );
      return;
    }

    if (isExactCommand(lowerText, "купить монеты другу")) {
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока или напиши: купить монеты другу @username");
        return;
      }

      if (Number(target.id) === Number(msg.from.id)) {
        await safeSendMessage(msg.chat.id, "❌ Себе через эту команду покупать нельзя.\nИспользуй: купить монеты");
        return;
      }

      await initUser(target);

      await safeSendMessage(
        msg.chat.id,
        `🎁 Покупка монет для ${getUserLink(target)}

Выбери пакет ниже:`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: getGiftShopKeyboard(target.id)
        }
      );
      return;
    }

    // OTHER / FUN
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

    if (
      isExactCommand(lowerText, "он врет?") ||
      isExactCommand(lowerText, "врет?") ||
      isExactCommand(lowerText, "он врёт?") ||
      isExactCommand(lowerText, "врёт?")
    ) {
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или напиши: он врет? @username");
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
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или напиши: респект @username");
        return;
      }

      await initUser(target);

      if (sender.id === target.id) {
        await safeSendMessage(msg.chat.id, "Себе респект дать нельзя 😅");
        return;
      }

      const result = await pool.query(
        `UPDATE users SET respect = COALESCE(respect, 0) + 1 WHERE user_id = $1 RETURNING respect`,
        [target.id]
      );

      const respectCount = result.rows[0]?.respect || 0;

      let out = `🤝 ${getUserLink(sender)} выразил респект ${getUserLink(target)}

Респект: ${respectCount}`;

      out = await appendLevelUpIfNeeded(out, sender.id, 2);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    if (isExactCommand(lowerText, "пара")) {
      const result = await pool.query(
        `
        SELECT user_id, first_name, last_name, username
        FROM chat_seen_users
        WHERE chat_id = $1
        ORDER BY RANDOM()
        LIMIT 2
        `,
        [msg.chat.id]
      );

      if (result.rows.length < 2) {
        await safeSendMessage(msg.chat.id, "Нужно хотя бы 2 человека, которых бот уже видел в этом чате 💞");
        return;
      }

      const pair = result.rows.map((row) => ({
        id: Number(row.user_id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        username: row.username || ""
      }));

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
        const parts = originalText.split(" ");
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
      const subject = originalText.slice(4).trim();

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

    if (lowerText.startsWith("подарок")) {
      const sender = msg.from;
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или напиши: подарок @username");
        return;
      }

      await initUser(target);

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

      let out = `🎁 ${getUserLink(sender)} подарил(а) ${getUserLink(target)} ${escapeHtml(gift)}`;
      out = await appendLevelUpIfNeeded(out, sender.id, 2);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // CUSTOM COMMANDS
    const customCommand = await getCustomCommandByTrigger(lowerText);
    if (customCommand) {
      const sender = msg.from;
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или используй @username.");
        return;
      }

      await initUser(target);

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

      let out = `💬 ${getUserLink(sender)} ${escapeHtml(customCommand.action_text)} ${getUserLink(target)}`;
      out = await appendLevelUpIfNeeded(out, sender.id, 2);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // RP COMMANDS + @username SUPPORT
    let matchedRpKey = null;
    for (const key of Object.keys(rpCommands)) {
      if (lowerText === key || lowerText.startsWith(`${key} `)) {
        matchedRpKey = key;
        break;
      }
    }

    if (matchedRpKey) {
      const command = rpCommands[matchedRpKey];
      const sender = msg.from;
      const target = await resolveTargetUserUniversal(msg);

      if (!target) {
        await safeSendMessage(msg.chat.id, "Ответь на сообщение человека или используй @username.");
        return;
      }

      await initUser(target);

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

      let out = `${command.emoji} ${getUserLink(sender)} ${command.text} ${getUserLink(target)}`;
      out = await appendLevelUpIfNeeded(out, sender.id, command.xp);

      await safeSendMessage(msg.chat.id, out, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }
  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
  }
});

// =========================
// CUSTOM COMMAND DB HELPERS
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

bot.onText(/^\/givemoney(@[A-Za-z0-9_]+)?(?:\s+(\d+))?$/, async (msg, match) => {
  try {
    if (Number(msg.from.id) !== OWNER_ID) return;

    const target = await resolveTargetUserUniversal(msg);
    const amount = Number(match?.[2] || 0);

    if (!target) {
      await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока или укажи @username и напиши: /givemoney 1000");
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.\nПример: /givemoney 1000");
      return;
    }

    await initUser(target);
    const newBalance = await addCoinsToUser(target.id, amount);

    await safeSendMessage(
      msg.chat.id,
      `💸 ${getUserLink(target)} получил(а) ${amount} монет.

Новый баланс: ${newBalance}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка /givemoney:", error);
    await safeSendMessage(msg.chat.id, "❌ Ошибка выдачи монет.");
  }
});

bot.onText(/^\/takemoney(@[A-Za-z0-9_]+)?(?:\s+(\d+))?$/, async (msg, match) => {
  try {
    if (Number(msg.from.id) !== OWNER_ID) return;

    const target = await resolveTargetUserUniversal(msg);
    const amount = Number(match?.[2] || 0);

    if (!target) {
      await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока или укажи @username и напиши: /takemoney 100");
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.\nПример: /takemoney 100");
      return;
    }

    await initUser(target);

    const result = await deductCoinsSafe(target.id, amount);

    await safeSendMessage(
      msg.chat.id,
      `💸 У игрока ${getUserLink(target)} забрано ${result.deducted} монет.

Новый баланс: ${result.balance}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    console.error("Ошибка /takemoney:", error);
    await safeSendMessage(msg.chat.id, "❌ Ошибка снятия монет.");
  }
});

bot.onText(/^\/timeedit(@[A-Za-z0-9_]+)?\s+(.+?)\s+([+-]?\d+)(?:\s+([^\s]+))?$/, async (msg, match) => {
  try {
    if (Number(msg.from.id) !== OWNER_ID) return;

    const cooldownName = String(match?.[2] || "").trim();
    const rawValue = String(match?.[3] || "").trim();
    const rawUnit = String(match?.[4] || "").trim();

    const deltaMs = parseTimeEditAmount(rawValue, rawUnit);
    if (deltaMs === null) {
      await safeSendMessage(
        msg.chat.id,
        "❌ Примеры:\n/timeedit деньги -4\n/timeedit охота -2 часа\n/timeedit снайпер -30 минут\n/timeedit ограбление -15 мин\n/timeedit ограбление банка -2 часа\n/timeedit банкомат -1 час\n/timeedit инкассация -2 часа\n/timeedit ювелирка -2 часа"
      );
      return;
    }

    const deltaMinutes = Math.abs(Math.trunc(deltaMs / 60000));
    if (deltaMinutes > TIME_EDIT_MAX_MINUTES) {
      await safeSendMessage(msg.chat.id, `❌ Можно менять максимум на ${TIME_EDIT_MAX_MINUTES} минут за раз.`);
      return;
    }

    let targetUser = null;
    if (msg.reply_to_message) targetUser = await resolveTargetUserFromReply(msg);
    if (!targetUser) targetUser = msg.from;

    await initUser(targetUser);

    const result = await adjustUserCooldown(targetUser.id, cooldownName, deltaMs);
    const signText =
      Math.abs(deltaMs) % (60 * 60 * 1000) === 0
        ? `${Number(rawValue)} ч`
        : `${Number(rawValue)} мин`;

    await safeSendMessage(
      msg.chat.id,
      `🕒 Время кулдауна изменено

👤 Игрок: ${getUserLink(targetUser)}
⏱ Кулдаун: ${escapeHtml(result.title)}
🔧 Изменение: ${signText}
📅 Новое время отсчёта: ${formatDateTime(result.newDate)}
⌛ Осталось до готовности: ${formatRemainingTime(result.remainingMs)}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  } catch (error) {
    if (error.message === "UNKNOWN_COOLDOWN_TYPE") {
      await safeSendMessage(msg.chat.id, "❌ Доступно: деньги, охота, снайпер, ограбление, ограбление банка, банкомат, инкассация, ювелирка, баскетбол, боулинг, кнб");
      return;
    }

    if (error.message === "COOLDOWN_NOT_USED_YET") {
      await safeSendMessage(msg.chat.id, "❌ У игрока этот кулдаун ещё не запускался.");
      return;
    }

    console.error("Ошибка /timeedit:", error);
    await safeSendMessage(msg.chat.id, "❌ Ошибка изменения времени кулдауна.");
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
    await clampAllShieldsToMax();
    await cleanupExpiredPunishments();
    await cleanupExpiredJail();
    await processLayLowReductions();
    await processPassiveWantedDecay();

    console.log("✅ Shields clamped to max =", MAX_SHIELDS);
    console.log("✅ Bot started");
  } catch (error) {
    console.error("❌ Ошибка запуска:", error);
  }
})();

// =========================
// DELETE MESSAGE (-сообщение)
// =========================
bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    // если сообщение начинается с "-"
    if (msg.text.startsWith("-") && msg.reply_to_message) {

      // только владелец (можешь убрать если надо всем админам)
      if (msg.from.id !== OWNER_ID) return;

      // удаляем сообщение пользователя
      await bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);

      // удаляем команду (-сообщение)
      await bot.deleteMessage(msg.chat.id, msg.message_id);
    }

  } catch (error) {
    console.error("Ошибка удаления:", error.message);
  }
});
