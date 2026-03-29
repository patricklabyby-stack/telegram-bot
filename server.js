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

function getBasketballResult() {
  const roll = Math.random();

  if (roll < 0.08) {
    return {
      type: "jackpot",
      text: "🏀 Идеальный дальний бросок!",
      coins: Math.floor(Math.random() * 21) + 20
    };
  }

  if (roll < 0.28) {
    return {
      type: "win",
      text: "🏀 Попал! Хороший бросок.",
      coins: Math.floor(Math.random() * 8) + 6
    };
  }

  return {
    type: "fail",
    text: "❌ Промах. Мяч отскочил от кольца.",
    coins: -(Math.floor(Math.random() * 5) + 3)
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

// Добавляем проверку на владельца прямо здесь
function getCooldownColumnAndMsByName(rawName, userId = null) {
  // Если это владелец — кулдаун не нужен
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
// CHAT USERS
// =========================
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

function addRecentActiveUser(chatId, user) {
  if (!chatId || !user || !user.id || user.is_bot) return;

  const key = String(chatId);
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
  const key = String(chatId);
  const users = Object.values(recentActiveUsers[key] || {});
  const now = Date.now();

  return users.filter((user) => {
    if (!user || !user.id) return false;
    if (excludeUserIds.includes(user.id)) return false;
    return now - (user.last_seen_at || 0) <= ACTIVE_WINDOW_MS;
  });
}

// =========================
// MENTION / TARGET RESOLVE
// =========================
function extractMentionUsername(text) {
  const match = String(text || "").match(/(^|\s)@([A-Za-z0-9_]{4,32})(?=\s|$)/);
  return match ? String(match[2]).toLowerCase() : null;
}

function cleanupTextWithoutMention(text) {
  return String(text || "")
    .replace(/(^|\s)@([A-Za-z0-9_]{4,32})(?=\s|$)/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStoredUser(row) {
  if (!row) return null;
  return {
    id: Number(row.user_id || row.id),
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    username: row.username || ""
  };
}

async function findUserByUsername(chatId, username) {
  const uname = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!uname) return null;

  const chatKey = String(chatId);

  const liveChatMembers = Object.values(chatMembers[chatKey] || {});
  const liveMember = liveChatMembers.find(
    (u) => String(u.username || "").toLowerCase() === uname
  );
  if (liveMember) return liveMember;

  const liveActiveMembers = Object.values(recentActiveUsers[chatKey] || {});
  const liveActiveMember = liveActiveMembers.find(
    (u) => String(u.username || "").toLowerCase() === uname
  );
  if (liveActiveMember) return liveActiveMember;

  const seen = await pool.query(
    `
    SELECT user_id, first_name, last_name, username
    FROM chat_seen_users
    WHERE chat_id = $1
      AND LOWER(username) = LOWER($2)
    LIMIT 1
    `,
    [chatId, uname]
  );
  if (seen.rows[0]) return buildStoredUser(seen.rows[0]);

  const users = await pool.query(
    `
    SELECT user_id, first_name, last_name, username
    FROM users
    WHERE LOWER(username) = LOWER($1)
    LIMIT 1
    `,
    [uname]
  );
  if (users.rows[0]) return buildStoredUser(users.rows[0]);

  return null;
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

async function resolveTargetUserUniversal(msg) {
  const byReply = await resolveTargetUserFromReply(msg);
  if (byReply) return byReply;

  const mentionedUsername = extractMentionUsername(msg.text || "");
  if (mentionedUsername) {
    const byMention = await findUserByUsername(msg.chat.id, mentionedUsername);
    if (byMention) return byMention;
  }

  return null;
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
      last_bowling_at TIMESTAMPTZ,
      last_knb_at TIMESTAMPTZ,
      total INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wanted_status (
      user_id BIGINT PRIMARY KEY,
      level INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lay_low_status (
      user_id BIGINT PRIMARY KEY,
      until_at TIMESTAMPTZ NOT NULL,
      last_reduce_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT FALSE
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_budgets (
      family_key TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS piggy_banks (
      child_user_id BIGINT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_dreams (
      child_user_id BIGINT PRIMARY KEY,
      dream_text TEXT NOT NULL,
      dream_balance INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_punishments (
      child_user_id BIGINT PRIMARY KEY,
      punished_by_user_id BIGINT NOT NULL,
      until_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_good_deeds (
      id SERIAL PRIMARY KEY,
      child_user_id BIGINT NOT NULL,
      added_by_user_id BIGINT NOT NULL,
      deed_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_obedience (
      child_user_id BIGINT PRIMARY KEY,
      value INTEGER DEFAULT 50,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS police_jail (
      user_id BIGINT PRIMARY KEY,
      until_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_shields (
      user_id BIGINT PRIMARY KEY,
      count INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jail_actions (
      user_id BIGINT PRIMARY KEY,
      last_escape_at TIMESTAMPTZ,
      last_lawyer_at TIMESTAMPTZ,
      last_bribe_at TIMESTAMPTZ,
      last_pray_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS couple_states (
      couple_key TEXT PRIMARY KEY,
      user1_id BIGINT NOT NULL,
      user2_id BIGINT NOT NULL,
      jealousy INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventories (
      user_id BIGINT NOT NULL,
      item_key TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, item_key)
    )
  `);

  // =========================
  // REPUTATION
  // =========================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_reputation (
      user_id BIGINT PRIMARY KEY,
      jail_entries INTEGER DEFAULT 0,
      jail_time_ms_total BIGINT DEFAULT 0,
      successful_escapes INTEGER DEFAULT 0,
      failed_escapes INTEGER DEFAULT 0,
      lawyer_uses INTEGER DEFAULT 0,
      bribe_uses INTEGER DEFAULT 0,
      prayers_count INTEGER DEFAULT 0,
      successful_robberies INTEGER DEFAULT 0,
      failed_robberies INTEGER DEFAULT 0,
      successful_bank_heists INTEGER DEFAULT 0,
      failed_bank_heists INTEGER DEFAULT 0,
      successful_van_heists INTEGER DEFAULT 0,
      failed_van_heists INTEGER DEFAULT 0,
      successful_jewelry_heists INTEGER DEFAULT 0,
      failed_jewelry_heists INTEGER DEFAULT 0,
      successful_atm_hacks INTEGER DEFAULT 0,
      failed_atm_hacks INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bowling_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_knb_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE jail_actions ADD COLUMN IF NOT EXISTS last_pray_at TIMESTAMPTZ`);

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

  await ensureWantedRow(user.id);
  await ensureLayLowRow(user.id);
  await ensureShieldRow(user.id);
  await ensureReputationRow(user.id);
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

async function addXpToUser(userId, amount) {
  const safeAmount = Math.max(0, Number(amount || 0));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const row = await client.query(
      `SELECT xp, level FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (!row.rows[0]) throw new Error("USER_NOT_FOUND");

    const oldXp = Number(row.rows[0].xp || 0);
    const oldLevel = Number(row.rows[0].level || 1);

    const newXp = oldXp + safeAmount;
    const newLevel = getLevelByXp(newXp);

    await client.query(
      `UPDATE users SET xp = $2, level = $3 WHERE user_id = $1`,
      [userId, newXp, newLevel]
    );

    await client.query("COMMIT");

    return {
      oldLevel,
      newLevel,
      xp: newXp,
      leveledUp: newLevel > oldLevel
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function appendLevelUpIfNeeded(text, userId, xpAmount) {
  try {
    const result = await addXpToUser(userId, xpAmount);
    if (result.leveledUp) {
      return `${text}\n\n🎉 Новый уровень: ${result.newLevel}`;
    }
    return text;
  } catch (error) {
    console.error("Ошибка XP:", error);
    return text;
  }
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

    if (!fromResult.rows[0] || !toResult.rows[0]) throw new Error("USER_NOT_FOUND");

    const fromBalance = Number(fromResult.rows[0].balance || 0);
    if (fromBalance < amount) throw new Error("NOT_ENOUGH_MONEY");

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

async function addCoinsToUser(userId, amount) {
  const result = await pool.query(
    `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE user_id = $1 RETURNING balance`,
    [userId, amount]
  );
  return Number(result.rows[0]?.balance || 0);
}

async function deductCoinsSafe(userId, amount) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const row = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!row.rows[0]) throw new Error("USER_NOT_FOUND");

    const currentBalance = Number(row.rows[0].balance || 0);
    const toDeduct = Math.min(currentBalance, amount);

    const updated = await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1 RETURNING balance`,
      [userId, toDeduct]
    );

    await client.query("COMMIT");

    return {
      deducted: toDeduct,
      balance: Number(updated.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deductCoinsExact(userId, amount) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const row = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!row.rows[0]) throw new Error("USER_NOT_FOUND");

    const current = Number(row.rows[0].balance || 0);
    if (current < amount) {
      await client.query("ROLLBACK");
      return { ok: false, balance: current };
    }

    const updated = await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1 RETURNING balance`,
      [userId, amount]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      balance: Number(updated.rows[0]?.balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function incrementStat(targetUserId, statField) {
  const allowedFields = [
    "kills", "hugs", "kisses", "hits", "bites", "pats", "kicks", "slaps",
    "punches", "licks", "steals", "scams", "destroys", "wakes", "freezes",
    "saves", "snowballs"
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

// =========================
// REPUTATION
// =========================
async function ensureReputationRow(userId) {
  await pool.query(
    `
    INSERT INTO user_reputation (user_id, updated_at)
    VALUES ($1, NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function getUserReputation(userId) {
  await ensureReputationRow(userId);
  const result = await pool.query(
    `SELECT * FROM user_reputation WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function incrementReputationField(userId, field, amount = 1) {
  const allowed = [
    "jail_entries",
    "successful_escapes",
    "failed_escapes",
    "lawyer_uses",
    "bribe_uses",
    "prayers_count",
    "successful_robberies",
    "failed_robberies",
    "successful_bank_heists",
    "failed_bank_heists",
    "successful_van_heists",
    "failed_van_heists",
    "successful_jewelry_heists",
    "failed_jewelry_heists",
    "successful_atm_hacks",
    "failed_atm_hacks"
  ];

  if (!allowed.includes(field)) return;
  await ensureReputationRow(userId);

  await pool.query(
    `
    UPDATE user_reputation
    SET ${field} = ${field} + $2,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, amount]
  );
}

async function addJailTimeToReputation(userId, ms) {
  await ensureReputationRow(userId);
  await pool.query(
    `
    UPDATE user_reputation
    SET jail_time_ms_total = COALESCE(jail_time_ms_total, 0) + $2,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, Number(ms || 0)]
  );
}

async function getReputationText(user) {
  await initUser(user);
  const rep = await getUserReputation(user.id);
  const wanted = await getWantedRow(user.id);
  const stats = await getUserStats(user.id);

  return `😈 Репутация игрока

Игрок: ${getUserLink(user)}
💰 Баланс: ${Number(stats?.balance || 0)}
🚨 Розыск: ${Number(wanted?.level || 0)}/${MAX_WANTED_LEVEL}

🚔 Тюрьма:
• Посадок: ${Number(rep?.jail_entries || 0)}
• Всего отсидел: ${formatDurationLong(rep?.jail_time_ms_total || 0)}
• Удачных побегов: ${Number(rep?.successful_escapes || 0)}
• Неудачных побегов: ${Number(rep?.failed_escapes || 0)}

🕵️ Преступления:
• Успешных ограблений: ${Number(rep?.successful_robberies || 0)}
• Провальных ограблений: ${Number(rep?.failed_robberies || 0)}
• Успешных взломов банкомата: ${Number(rep?.successful_atm_hacks || 0)}
• Провальных взломов банкомата: ${Number(rep?.failed_atm_hacks || 0)}
• Успешных ограблений ювелирки: ${Number(rep?.successful_jewelry_heists || 0)}
• Провальных ограблений ювелирки: ${Number(rep?.failed_jewelry_heists || 0)}
• Успешных ограблений банка: ${Number(rep?.successful_bank_heists || 0)}
• Провальных ограблений банка: ${Number(rep?.failed_bank_heists || 0)}
• Успешных нападений на инкассацию: ${Number(rep?.successful_van_heists || 0)}
• Провальных нападений на инкассацию: ${Number(rep?.failed_van_heists || 0)}

⚖️ Действия в тюрьме:
• Адвокат: ${Number(rep?.lawyer_uses || 0)}
• Подкуп охраны: ${Number(rep?.bribe_uses || 0)}
• Молитвы: ${Number(rep?.prayers_count || 0)}`;
}

// =========================
// INVENTORY / BLACK MARKET
// =========================
async function ensureInventoryRow(userId, itemKey) {
  await pool.query(
    `
    INSERT INTO inventories (user_id, item_key, count, updated_at)
    VALUES ($1, $2, 0, NOW())
    ON CONFLICT (user_id, item_key) DO NOTHING
    `,
    [userId, itemKey]
  );
}

async function getInventoryItem(userId, itemKey) {
  await ensureInventoryRow(userId, itemKey);
  const result = await pool.query(
    `SELECT user_id, item_key, count, updated_at FROM inventories WHERE user_id = $1 AND item_key = $2 LIMIT 1`,
    [userId, itemKey]
  );
  return result.rows[0] || null;
}

async function getFullInventory(userId) {
  const result = await pool.query(
    `
    SELECT item_key, count, updated_at
    FROM inventories
    WHERE user_id = $1
    ORDER BY item_key ASC
    `,
    [userId]
  );

  const byKey = {};
  for (const row of result.rows) {
    byKey[row.item_key] = Number(row.count || 0);
  }

  for (const key of Object.keys(ITEMS)) {
    if (typeof byKey[key] === "undefined") byKey[key] = 0;
  }

  return byKey;
}

async function addItemToInventory(userId, itemKey, amount = 1) {
  await ensureInventoryRow(userId, itemKey);
  const result = await pool.query(
    `
    UPDATE inventories
    SET count = count + $3,
        updated_at = NOW()
    WHERE user_id = $1 AND item_key = $2
    RETURNING count
    `,
    [userId, itemKey, amount]
  );
  return Number(result.rows[0]?.count || 0);
}

async function removeItemFromInventory(userId, itemKey, amount = 1) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO inventories (user_id, item_key, count, updated_at)
      VALUES ($1, $2, 0, NOW())
      ON CONFLICT (user_id, item_key) DO NOTHING
      `,
      [userId, itemKey]
    );

    const row = await client.query(
      `SELECT count FROM inventories WHERE user_id = $1 AND item_key = $2 FOR UPDATE`,
      [userId, itemKey]
    );

    const current = Number(row.rows[0]?.count || 0);
    if (current < amount) {
      await client.query("ROLLBACK");
      return { ok: false, count: current };
    }

    const updated = await client.query(
      `
      UPDATE inventories
      SET count = count - $3,
          updated_at = NOW()
      WHERE user_id = $1 AND item_key = $2
      RETURNING count
      `,
      [userId, itemKey, amount]
    );

    await client.query("COMMIT");
    return { ok: true, count: Number(updated.rows[0]?.count || 0) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function buyBlackMarketItem(userId, itemKey) {
  const item = ITEMS[itemKey];
  if (!item) throw new Error("BAD_ITEM");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO inventories (user_id, item_key, count, updated_at)
      VALUES ($1, $2, 0, NOW())
      ON CONFLICT (user_id, item_key) DO NOTHING
      `,
      [userId, itemKey]
    );

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const balance = Number(userRow.rows[0].balance || 0);
    if (balance < item.price) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [userId, item.price]
    );

    const itemRow = await client.query(
      `
      UPDATE inventories
      SET count = count + 1,
          updated_at = NOW()
      WHERE user_id = $1 AND item_key = $2
      RETURNING count
      `,
      [userId, itemKey]
    );

    const updatedUser = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    return {
      itemCount: Number(itemRow.rows[0]?.count || 0),
      balance: Number(updatedUser.rows[0]?.balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function resolveItemKey(raw) {
  const normalized = normalizeText(raw).replace(/\s+/g, " ");
  if (ITEM_ALIASES[normalized]) return ITEM_ALIASES[normalized];

  const compact = normalized.replace(/\s+/g, "");
  if (ITEM_ALIASES[compact]) return ITEM_ALIASES[compact];

  return null;
}

// =========================
// WANTED / LAY LOW
// =========================
function getWantedStatusText(level) {
  const val = Number(level || 0);
  if (val <= 0) return "чист";
  if (val === 1) return "подозреваемый";
  if (val === 2) return "заметный преступник";
  if (val === 3) return "опасный преступник";
  if (val === 4) return "очень опасный";
  return "максимальный розыск";
}

function getWantedEffectText(level) {
  const val = Number(level || 0);
  if (val <= 0) return "• полиция почти не реагирует";
  if (val === 1) return "• полиция иногда реагирует\n• шанс штрафа выше";
  if (val === 2) return "• полиция чаще реагирует\n• штрафы выше\n• криминал опаснее";
  if (val === 3) return "• высокий шанс ареста\n• банк и инкассация очень опасны";
  if (val === 4) return "• полиция почти всегда рядом\n• провалы и тюрьма вероятнее";
  return "• почти любое преступление может закончиться арестом";
}

async function ensureWantedRow(userId) {
  await pool.query(
    `
    INSERT INTO wanted_status (user_id, level, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function getWantedRow(userId) {
  const result = await pool.query(
    `SELECT user_id, level, updated_at FROM wanted_status WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function changeWantedLevel(userId, diff) {
  await ensureWantedRow(userId);

  const row = await getWantedRow(userId);
  const current = Number(row?.level || 0);
  const updated = clamp(current + Number(diff || 0), 0, MAX_WANTED_LEVEL);

  const result = await pool.query(
    `
    UPDATE wanted_status
    SET level = $2,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, level, updated_at
    `,
    [userId, updated]
  );

  return result.rows[0] || null;
}

async function setWantedLevel(userId, level) {
  await ensureWantedRow(userId);

  const result = await pool.query(
    `
    UPDATE wanted_status
    SET level = $2,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, level, updated_at
    `,
    [userId, clamp(Number(level || 0), 0, MAX_WANTED_LEVEL)]
  );

  return result.rows[0] || null;
}

async function ensureLayLowRow(userId) {
  await pool.query(
    `
    INSERT INTO lay_low_status (user_id, until_at, last_reduce_at, created_at, updated_at, is_active)
    VALUES ($1, NOW(), NOW(), NOW(), NOW(), FALSE)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function getLayLowStatus(userId) {
  await ensureLayLowRow(userId);

  const result = await pool.query(
    `
    SELECT user_id, until_at, last_reduce_at, created_at, updated_at, is_active
    FROM lay_low_status
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0] || null;
  if (!row) return null;

  if (row.is_active && new Date(row.until_at).getTime() <= Date.now()) {
    await deactivateLayLow(userId);
    return { ...row, is_active: false };
  }

  return row;
}

async function activateLayLow(userId) {
  await ensureLayLowRow(userId);

  const result = await pool.query(
    `
    UPDATE lay_low_status
    SET until_at = NOW() + ($2 || ' milliseconds')::interval,
        last_reduce_at = NOW(),
        updated_at = NOW(),
        created_at = NOW(),
        is_active = TRUE
    WHERE user_id = $1
    RETURNING user_id, until_at, last_reduce_at, created_at, updated_at, is_active
    `,
    [userId, String(LAY_LOW_DURATION_MS)]
  );

  return result.rows[0] || null;
}

async function deactivateLayLow(userId) {
  await ensureLayLowRow(userId);

  const result = await pool.query(
    `
    UPDATE lay_low_status
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, until_at, last_reduce_at, created_at, updated_at, is_active
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getLayLowBlockText(userId) {
  const status = await getLayLowStatus(userId);
  if (!status || !status.is_active) return null;

  const remain = new Date(status.until_at).getTime() - Date.now();
  return `❌ Ты сейчас залёг на дно.\n⏳ Осталось: ${formatRemainingTime(remain)}\nПока скрытность активна, преступления запрещены.`;
}

async function processLayLowReductions() {
  const result = await pool.query(`
    SELECT user_id, until_at, last_reduce_at, is_active
    FROM lay_low_status
    WHERE is_active = TRUE
  `);

  for (const row of result.rows) {
    const userId = Number(row.user_id);
    const untilMs = new Date(row.until_at).getTime();
    const lastReduceMs = row.last_reduce_at ? new Date(row.last_reduce_at).getTime() : Date.now();
    const now = Date.now();

    if (untilMs <= now) {
      await deactivateLayLow(userId);
      continue;
    }

    const steps = Math.floor((now - lastReduceMs) / LAY_LOW_REDUCE_STEP_MS);
    if (steps <= 0) continue;

    const wanted = await getWantedRow(userId);
    const currentWanted = Number(wanted?.level || 0);
    const newWanted = Math.max(0, currentWanted - steps);

    await pool.query(
      `
      UPDATE wanted_status
      SET level = $2,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, newWanted]
    );

    const newLastReduce = new Date(lastReduceMs + steps * LAY_LOW_REDUCE_STEP_MS);

    await pool.query(
      `
      UPDATE lay_low_status
      SET last_reduce_at = $2,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, newLastReduce.toISOString()]
    );
  }
}

async function processPassiveWantedDecay() {
  const result = await pool.query(`
    SELECT w.user_id, w.level, w.updated_at, COALESCE(l.is_active, FALSE) AS lay_low_active
    FROM wanted_status w
    LEFT JOIN lay_low_status l ON l.user_id = w.user_id
    WHERE w.level > 0
  `);

  for (const row of result.rows) {
    const userId = Number(row.user_id);
    const isLayLow = row.lay_low_active === true || row.lay_low_active === "t";
    if (isLayLow) continue;

    const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    const now = Date.now();
    const steps = Math.floor((now - updatedMs) / WANTED_PASSIVE_DECAY_MS);

    if (steps <= 0) continue;

    const currentWanted = Number(row.level || 0);
    const newWanted = Math.max(0, currentWanted - steps);

    await pool.query(
      `
      UPDATE wanted_status
      SET level = $2,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, newWanted]
    );
  }
}

// =========================
// SHIELDS
// =========================
async function ensureShieldRow(userId) {
  await pool.query(
    `
    INSERT INTO user_shields (user_id, count, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function getShieldRow(userId) {
  await ensureShieldRow(userId);

  const result = await pool.query(
    `SELECT user_id, count, updated_at FROM user_shields WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function buyShield(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO user_shields (user_id, count, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const shieldRow = await client.query(
      `SELECT count FROM user_shields WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const currentBalance = Number(userRow.rows[0].balance || 0);
    const currentShields = Number(shieldRow.rows[0]?.count || 0);

    if (currentShields >= MAX_SHIELDS) throw new Error("MAX_SHIELDS_REACHED");
    if (currentBalance < SHIELD_COST) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [userId, SHIELD_COST]
    );

    const updatedShield = await client.query(
      `
      UPDATE user_shields
      SET count = count + 1,
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING count, updated_at
      `,
      [userId]
    );

    const updatedUser = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    return {
      shieldCount: Number(updatedShield.rows[0].count || 0),
      updatedAt: updatedShield.rows[0].updated_at,
      userBalance: Number(updatedUser.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function useShieldOnce(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO user_shields (user_id, count, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    const row = await client.query(
      `SELECT count FROM user_shields WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const current = Number(row.rows[0]?.count || 0);
    if (current <= 0) {
      await client.query("ROLLBACK");
      return { used: false, count: 0 };
    }

    const updated = await client.query(
      `
      UPDATE user_shields
      SET count = count - 1,
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING count
      `,
      [userId]
    );

    await client.query("COMMIT");

    return {
      used: true,
      count: Number(updated.rows[0]?.count || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function clampAllShieldsToMax() {
  await pool.query(
    `UPDATE user_shields SET count = $1, updated_at = NOW() WHERE count > $1`,
    [MAX_SHIELDS]
  );
}

// =========================
// MARRIAGE / FAMILY
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

async function assertChildInMyFamily(parentUserId, childUserId) {
  const isChild = await isChildInMyFamily(parentUserId, childUserId);
  if (!isChild) {
    return {
      ok: false,
      text: "❌ Это не ваш ребёнок. Ответь на сообщение именно своего ребёнка."
    };
  }
  return { ok: true };
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
    return { ok: false, text: "❌ Нельзя усыновить самого себя." };
  }

  const parentMarriage = await getMarriagePartner(parentUserId);
  if (!parentMarriage) {
    return { ok: false, text: "❌ Усыновлять ребёнка могут только люди в браке." };
  }

  const parentIsChild = await isUserChild(parentUserId);
  if (parentIsChild) {
    return { ok: false, text: "❌ Ребёнок не может усыновлять других игроков." };
  }

  const targetIsSpouse = await isSpouse(parentUserId, targetUserId);
  if (targetIsSpouse) {
    return { ok: false, text: "❌ Нельзя усыновить своего супруга(у)." };
  }

  const targetMarriage = await getMarriagePartner(targetUserId);
  if (targetMarriage) {
    return { ok: false, text: "❌ Нельзя усыновить игрока, который состоит в браке." };
  }

  const activeAdoption = await getActiveAdoptionByChildId(targetUserId);
  if (activeAdoption) {
    return { ok: false, text: "❌ Этот ребёнок уже усыновлён. Выбери другого ребёнка." };
  }

  const childrenCount = await getFamilyChildrenCount(parentUserId);
  if (childrenCount >= MAX_CHILDREN_PER_FAMILY) {
    return { ok: false, text: `❌ В семье уже максимум ${MAX_CHILDREN_PER_FAMILY} ребёнка(детей).` };
  }

  return { ok: true };
}

// =========================
// COUPLE STATE
// =========================
async function ensureCoupleState(user1Id, user2Id) {
  const coupleKey = getCoupleKeyByUserIds(user1Id, user2Id);
  const ids = [Number(user1Id), Number(user2Id)].sort((a, b) => a - b);

  await pool.query(
    `
    INSERT INTO couple_states (couple_key, user1_id, user2_id, jealousy, updated_at)
    VALUES ($1, $2, $3, 0, NOW())
    ON CONFLICT (couple_key) DO NOTHING
    `,
    [coupleKey, ids[0], ids[1]]
  );

  return coupleKey;
}

async function getCoupleState(user1Id, user2Id) {
  const coupleKey = await ensureCoupleState(user1Id, user2Id);

  const result = await pool.query(
    `
    SELECT couple_key, user1_id, user2_id, jealousy, updated_at
    FROM couple_states
    WHERE couple_key = $1
    LIMIT 1
    `,
    [coupleKey]
  );

  return result.rows[0] || null;
}

async function changeCoupleJealousy(user1Id, user2Id, diff) {
  const state = await getCoupleState(user1Id, user2Id);
  const current = Number(state?.jealousy || 0);
  const updatedValue = clamp(current + Number(diff || 0), 0, 100);
  const coupleKey = getCoupleKeyByUserIds(user1Id, user2Id);

  const result = await pool.query(
    `
    UPDATE couple_states
    SET jealousy = $2,
        updated_at = NOW()
    WHERE couple_key = $1
    RETURNING couple_key, user1_id, user2_id, jealousy, updated_at
    `,
    [coupleKey, updatedValue]
  );

  return result.rows[0] || null;
}

// =========================
// PUNISHMENTS / GOOD DEEDS
// =========================
async function cleanupExpiredPunishments() {
  await pool.query(`
    UPDATE child_punishments
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND until_at <= NOW()
  `);
}

async function getActivePunishment(childUserId) {
  await cleanupExpiredPunishments();

  const result = await pool.query(
    `
    SELECT *
    FROM child_punishments
    WHERE child_user_id = $1
      AND is_active = TRUE
      AND until_at > NOW()
    LIMIT 1
    `,
    [childUserId]
  );

  return result.rows[0] || null;
}

async function setPunishment(parentUserId, childUserId, days) {
  const result = await pool.query(
    `
    INSERT INTO child_punishments (
      child_user_id,
      punished_by_user_id,
      until_at,
      created_at,
      is_active
    )
    VALUES ($1, $2, NOW() + ($3 || ' days')::interval, NOW(), TRUE)
    ON CONFLICT (child_user_id)
    DO UPDATE SET
      punished_by_user_id = EXCLUDED.punished_by_user_id,
      until_at = EXCLUDED.until_at,
      created_at = NOW(),
      is_active = TRUE
    RETURNING *
    `,
    [childUserId, parentUserId, String(days)]
  );

  return result.rows[0] || null;
}

async function removePunishment(childUserId) {
  const result = await pool.query(
    `
    UPDATE child_punishments
    SET is_active = FALSE
    WHERE child_user_id = $1
      AND is_active = TRUE
    RETURNING *
    `,
    [childUserId]
  );

  return result.rows[0] || null;
}

async function getPunishedBlockText(childUserId) {
  const punishment = await getActivePunishment(childUserId);
  if (!punishment) return null;

  const remaining = new Date(punishment.until_at).getTime() - Date.now();
  return `❌ Ребёнок сейчас наказан(а).\n⏳ Осталось: ${formatRemainingTime(remaining)}`;
}

async function ensureChildObedience(childUserId) {
  await pool.query(
    `
    INSERT INTO child_obedience (child_user_id, value, updated_at)
    VALUES ($1, 50, NOW())
    ON CONFLICT (child_user_id) DO NOTHING
    `,
    [childUserId]
  );
}

async function getChildObedience(childUserId) {
  await ensureChildObedience(childUserId);

  const result = await pool.query(
    `
    SELECT child_user_id, value, updated_at
    FROM child_obedience
    WHERE child_user_id = $1
    LIMIT 1
    `,
    [childUserId]
  );

  return result.rows[0] || null;
}

async function changeChildObedience(childUserId, diff) {
  await ensureChildObedience(childUserId);

  const current = await getChildObedience(childUserId);
  const currentValue = Number(current?.value || 50);
  const newValue = clamp(currentValue + Number(diff || 0), 0, 100);

  const result = await pool.query(
    `
    UPDATE child_obedience
    SET value = $2,
        updated_at = NOW()
    WHERE child_user_id = $1
    RETURNING child_user_id, value, updated_at
    `,
    [childUserId, newValue]
  );

  return result.rows[0] || null;
}

async function addGoodDeed(parentUserId, childUserId, deedText) {
  const cleaned = String(deedText || "").trim();
  const result = await pool.query(
    `
    INSERT INTO child_good_deeds (child_user_id, added_by_user_id, deed_text)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [childUserId, parentUserId, cleaned]
  );
  return result.rows[0] || null;
}

async function getGoodDeeds(childUserId) {
  const result = await pool.query(
    `
    SELECT id, child_user_id, added_by_user_id, deed_text, created_at
    FROM child_good_deeds
    WHERE child_user_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [childUserId]
  );
  return result.rows;
}

async function deleteGoodDeedByIndex(childUserId, index) {
  const deeds = await getGoodDeeds(childUserId);
  if (!deeds[index - 1]) return null;

  const deedId = Number(deeds[index - 1].id);

  const result = await pool.query(
    `
    DELETE FROM child_good_deeds
    WHERE id = $1 AND child_user_id = $2
    RETURNING *
    `,
    [deedId, childUserId]
  );

  return result.rows[0] || null;
}

async function clearGoodDeeds(childUserId) {
  const result = await pool.query(
    `
    DELETE FROM child_good_deeds
    WHERE child_user_id = $1
    RETURNING id
    `,
    [childUserId]
  );
  return result.rowCount || 0;
}

// =========================
// FAMILY MONEY / PIGGY / DREAMS
// =========================
async function getFamilyKeyByUserId(userId) {
  const childInfo = await getActiveAdoptionByChildId(userId);

  if (childInfo) {
    const parentId = Number(childInfo.parent_user_id);
    const partnerInfo = await getMarriagePartner(parentId);

    if (partnerInfo) {
      const ids = [parentId, Number(partnerInfo.partnerId)].sort((a, b) => a - b);
      return `married:${ids[0]}:${ids[1]}`;
    }

    return `single:${parentId}`;
  }

  const marriageInfo = await getMarriagePartner(userId);
  if (marriageInfo) {
    const ids = [Number(userId), Number(marriageInfo.partnerId)].sort((a, b) => a - b);
    return `married:${ids[0]}:${ids[1]}`;
  }

  return null;
}

async function getFamilyBudget(userId) {
  const familyKey = await getFamilyKeyByUserId(userId);
  if (!familyKey) return null;

  await pool.query(
    `
    INSERT INTO family_budgets (family_key, balance, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (family_key) DO NOTHING
    `,
    [familyKey]
  );

  const result = await pool.query(
    `SELECT family_key, balance, updated_at FROM family_budgets WHERE family_key = $1 LIMIT 1`,
    [familyKey]
  );

  return result.rows[0] || null;
}

async function addToFamilyBudget(userId, amount) {
  const familyKey = await getFamilyKeyByUserId(userId);
  if (!familyKey) throw new Error("NO_FAMILY");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO family_budgets (family_key, balance, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (family_key) DO NOTHING
      `,
      [familyKey]
    );

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const currentBalance = Number(userRow.rows[0].balance || 0);
    if (currentBalance < amount) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [userId, amount]
    );

    const familyBudgetRow = await client.query(
      `
      UPDATE family_budgets
      SET balance = balance + $2,
          updated_at = NOW()
      WHERE family_key = $1
      RETURNING balance, updated_at
      `,
      [familyKey, amount]
    );

    const updatedUserRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    return {
      familyKey,
      familyBalance: Number(familyBudgetRow.rows[0].balance || 0),
      userBalance: Number(updatedUserRow.rows[0].balance || 0),
      updatedAt: familyBudgetRow.rows[0].updated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function takeFromFamilyBudget(userId, amount) {
  const familyKey = await getFamilyKeyByUserId(userId);
  if (!familyKey) throw new Error("NO_FAMILY");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO family_budgets (family_key, balance, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (family_key) DO NOTHING
      `,
      [familyKey]
    );

    const budgetRow = await client.query(
      `SELECT balance FROM family_budgets WHERE family_key = $1 FOR UPDATE`,
      [familyKey]
    );

    if (!budgetRow.rows[0]) throw new Error("BUDGET_NOT_FOUND");

    const currentBudget = Number(budgetRow.rows[0].balance || 0);
    if (currentBudget < amount) throw new Error("NOT_ENOUGH_FAMILY_MONEY");

    await client.query(
      `
      UPDATE family_budgets
      SET balance = balance - $2,
          updated_at = NOW()
      WHERE family_key = $1
      `,
      [familyKey, amount]
    );

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const updatedUser = await client.query(
      `UPDATE users SET balance = balance + $2 WHERE user_id = $1 RETURNING balance`,
      [userId, amount]
    );

    const updatedBudget = await client.query(
      `SELECT balance, updated_at FROM family_budgets WHERE family_key = $1`,
      [familyKey]
    );

    await client.query("COMMIT");

    return {
      familyKey,
      familyBalance: Number(updatedBudget.rows[0].balance || 0),
      userBalance: Number(updatedUser.rows[0].balance || 0),
      updatedAt: updatedBudget.rows[0].updated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPiggyBank(childUserId) {
  const result = await pool.query(
    `SELECT child_user_id, balance, updated_at FROM piggy_banks WHERE child_user_id = $1 LIMIT 1`,
    [childUserId]
  );
  return result.rows[0] || null;
}

async function createPiggyBank(childUserId) {
  const result = await pool.query(
    `
    INSERT INTO piggy_banks (child_user_id, balance, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (child_user_id)
    DO UPDATE SET updated_at = piggy_banks.updated_at
    RETURNING child_user_id, balance, updated_at
    `,
    [childUserId]
  );
  return result.rows[0] || null;
}

async function addToPiggyBank(childUserId, amount) {
  const existing = await getPiggyBank(childUserId);
  if (!existing) throw new Error("NO_PIGGY_BANK");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [childUserId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const userBalance = Number(userRow.rows[0].balance || 0);
    if (userBalance < amount) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [childUserId, amount]
    );

    const piggy = await client.query(
      `
      UPDATE piggy_banks
      SET balance = balance + $2,
          updated_at = NOW()
      WHERE child_user_id = $1
      RETURNING balance, updated_at
      `,
      [childUserId, amount]
    );

    const updatedUser = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [childUserId]
    );

    await client.query("COMMIT");

    return {
      piggyBalance: Number(piggy.rows[0].balance || 0),
      userBalance: Number(updatedUser.rows[0].balance || 0),
      updatedAt: piggy.rows[0].updated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function breakPiggyBank(childUserId) {
  const existing = await getPiggyBank(childUserId);
  if (!existing) throw new Error("NO_PIGGY_BANK");

  const amount = Number(existing.balance || 0);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (amount > 0) {
      await client.query(
        `UPDATE users SET balance = balance + $2 WHERE user_id = $1`,
        [childUserId, amount]
      );
    }

    await client.query(
      `
      UPDATE piggy_banks
      SET balance = 0,
          updated_at = NOW()
      WHERE child_user_id = $1
      `,
      [childUserId]
    );

    const updatedUser = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [childUserId]
    );

    const piggy = await client.query(
      `SELECT balance, updated_at FROM piggy_banks WHERE child_user_id = $1`,
      [childUserId]
    );

    await client.query("COMMIT");

    return {
      taken: amount,
      userBalance: Number(updatedUser.rows[0]?.balance || 0),
      piggyBalance: Number(piggy.rows[0]?.balance || 0),
      updatedAt: piggy.rows[0]?.updated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getChildDream(childUserId) {
  const result = await pool.query(
    `
    SELECT child_user_id, dream_text, dream_balance, created_at, updated_at
    FROM child_dreams
    WHERE child_user_id = $1
    LIMIT 1
    `,
    [childUserId]
  );
  return result.rows[0] || null;
}

async function setChildDream(childUserId, dreamText) {
  const cleaned = String(dreamText || "").trim();

  const result = await pool.query(
    `
    INSERT INTO child_dreams (child_user_id, dream_text, dream_balance, created_at, updated_at)
    VALUES ($1, $2, 0, NOW(), NOW())
    ON CONFLICT (child_user_id)
    DO UPDATE SET
      dream_text = EXCLUDED.dream_text,
      updated_at = NOW()
    RETURNING child_user_id, dream_text, dream_balance, created_at, updated_at
    `,
    [childUserId, cleaned]
  );

  return result.rows[0] || null;
}

async function deleteChildDream(childUserId) {
  const result = await pool.query(
    `
    DELETE FROM child_dreams
    WHERE child_user_id = $1
    RETURNING child_user_id, dream_balance
    `,
    [childUserId]
  );
  return result.rows[0] || null;
}

async function addSelfMoneyToDream(childUserId, amount) {
  const dream = await getChildDream(childUserId);
  if (!dream) throw new Error("NO_DREAM");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [childUserId]
    );

    if (!userRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const userBalance = Number(userRow.rows[0].balance || 0);
    if (userBalance < amount) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [childUserId, amount]
    );

    const dreamRow = await client.query(
      `
      UPDATE child_dreams
      SET dream_balance = dream_balance + $2,
          updated_at = NOW()
      WHERE child_user_id = $1
      RETURNING dream_text, dream_balance, updated_at
      `,
      [childUserId, amount]
    );

    const updatedUser = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [childUserId]
    );

    await client.query("COMMIT");

    return {
      dreamText: dreamRow.rows[0].dream_text,
      dreamBalance: Number(dreamRow.rows[0].dream_balance || 0),
      updatedAt: dreamRow.rows[0].updated_at,
      userBalance: Number(updatedUser.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function addParentMoneyToDream(parentUserId, childUserId, amount) {
  const dream = await getChildDream(childUserId);
  if (!dream) throw new Error("NO_DREAM");

  const childCheck = await assertChildInMyFamily(parentUserId, childUserId);
  if (!childCheck.ok) throw new Error("NOT_MY_CHILD");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const parentRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [parentUserId]
    );

    if (!parentRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const parentBalance = Number(parentRow.rows[0].balance || 0);
    if (parentBalance < amount) throw new Error("NOT_ENOUGH_MONEY");

    await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1`,
      [parentUserId, amount]
    );

    const dreamRow = await client.query(
      `
      UPDATE child_dreams
      SET dream_balance = dream_balance + $2,
          updated_at = NOW()
      WHERE child_user_id = $1
      RETURNING dream_text, dream_balance, updated_at
      `,
      [childUserId, amount]
    );

    const updatedParent = await client.query(
      `SELECT balance FROM users WHERE user_id = $1`,
      [parentUserId]
    );

    await client.query("COMMIT");

    return {
      dreamText: dreamRow.rows[0].dream_text,
      dreamBalance: Number(dreamRow.rows[0].dream_balance || 0),
      updatedAt: dreamRow.rows[0].updated_at,
      parentBalance: Number(updatedParent.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// =========================
// JAIL
// =========================
async function cleanupExpiredJail() {
  await pool.query(`
    DELETE FROM police_jail
    WHERE until_at <= NOW()
  `);
}

async function getJailStatus(userId) {
  await cleanupExpiredJail();

  const result = await pool.query(
    `
    SELECT *
    FROM police_jail
    WHERE user_id = $1
      AND until_at > NOW()
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function sendUserToJail(userId, ms = POLICE_JAIL_MS) {
  await incrementReputationField(userId, "jail_entries", 1);
  await addJailTimeToReputation(userId, ms);

  const result = await pool.query(
    `
    INSERT INTO police_jail (user_id, until_at, created_at, updated_at)
    VALUES ($1, NOW() + ($2 || ' milliseconds')::interval, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      until_at = EXCLUDED.until_at,
      updated_at = NOW()
    RETURNING *
    `,
    [userId, String(ms)]
  );

  return result.rows[0] || null;
}

async function extendJailTime(userId, ms) {
  await addJailTimeToReputation(userId, ms);

  const result = await pool.query(
    `
    UPDATE police_jail
    SET until_at = until_at + ($2 || ' milliseconds')::interval,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING *
    `,
    [userId, String(ms)]
  );
  return result.rows[0] || null;
}

async function reduceJailTime(userId, ms) {
  const jail = await getJailStatus(userId);
  if (!jail) return null;

  const currentUntil = new Date(jail.until_at).getTime();
  const now = Date.now();
  const newUntil = new Date(Math.max(now + 1000, currentUntil - ms));

  const result = await pool.query(
    `
    UPDATE police_jail
    SET until_at = $2,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING *
    `,
    [userId, newUntil.toISOString()]
  );

  return result.rows[0] || null;
}

async function removeUserFromJail(userId) {
  const result = await pool.query(
    `
    DELETE FROM police_jail
    WHERE user_id = $1
    RETURNING *
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getJailBlockText(userId) {
  const jail = await getJailStatus(userId);
  if (!jail) return null;

  const remainingMs = new Date(jail.until_at).getTime() - Date.now();
  return `🚔 Ты сейчас в тюрьме.\n⏳ До освобождения: ${formatRemainingTime(remainingMs)}`;
}

async function ensureJailActionRow(userId) {
  await pool.query(
    `
    INSERT INTO jail_actions (user_id, updated_at)
    VALUES ($1, NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function getJailActionRow(userId) {
  await ensureJailActionRow(userId);
  const result = await pool.query(
    `
    SELECT user_id, last_escape_at, last_lawyer_at, last_bribe_at, last_pray_at, updated_at
    FROM jail_actions
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function setJailActionUsed(userId, actionField) {
  const allowed = ["last_escape_at", "last_lawyer_at", "last_bribe_at", "last_pray_at"];
  if (!allowed.includes(actionField)) return;

  await ensureJailActionRow(userId);
  await pool.query(
    `
    UPDATE jail_actions
    SET ${actionField} = NOW(),
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId]
  );
}

function getActionRemaining(lastAt, cooldownMs) {
  if (!lastAt) return 0;
  const nextTime = new Date(new Date(lastAt).getTime() + cooldownMs);
  const diff = nextTime.getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

function getRandomPoliceOutcome(wantedLevel = 0) {
  const wanted = Number(wantedLevel || 0);
  const roll = Math.random();

  const noneBorder = Math.max(0.06, 0.42 - wanted * 0.08);
  const fineBorder = Math.max(noneBorder + 0.12, 0.78 - wanted * 0.05);
  const returnBorder = Math.max(fineBorder + 0.05, 0.89 - wanted * 0.03);

  if (roll < noneBorder) return { type: "none" };
  if (roll < fineBorder) return { type: "fine", amount: Math.floor(Math.random() * 8) + 4 + wanted * 2 };
  if (roll < returnBorder) return { type: "return" };
  return { type: "jail" };
}

function getRandomEscapeOutcome(wantedLevel = 0, hasArmor = false, hasPassport = false) {
  const wanted = Number(wantedLevel || 0);

  let successChance = 0.50;
  successChance -= wanted * 0.04;
  if (hasArmor) successChance += 0.03;
  if (hasPassport) successChance += 0.03;

  successChance = clamp(successChance, 0.35, 0.60);

  const roll = Math.random();

  if (roll < successChance) {
    return { type: "success" };
  }

  if (roll < successChance + 0.30) {
    return { type: "fail" };
  }

  return { type: "caught_more_time", extraMs: 20 * 60 * 1000 };
}

function getRandomLawyerOutcome() {
  const roll = Math.random();

  if (roll < 0.20) return { type: "free" };
  if (roll < 0.75) return { type: "reduce", reduceMs: (15 + Math.floor(Math.random() * 21)) * 60 * 1000 };
  return { type: "fail" };
}

function getRandomBribeOutcome(wantedLevel = 0, hasPassport = false) {
  const wanted = Number(wantedLevel || 0);

  let freeChance = 0.38;
  freeChance -= wanted * 0.04;
  if (hasPassport) freeChance += 0.04;

  freeChance = clamp(freeChance, 0.20, 0.50);

  const roll = Math.random();

  if (roll < freeChance) return { type: "free" };
  if (roll < freeChance + 0.35) return { type: "fail" };
  return { type: "caught_more_time", extraMs: 25 * 60 * 1000 };
}

// =========================
// GAME COOLDOWNS
// =========================
async function updateCooldownColumnNow(userId, column) {
  // Если владелец, не обновляем кулдаун
  if (isOwner(userId)) return;
  await pool.query(`UPDATE users SET ${column} = NOW() WHERE user_id = $1`, [userId]);
}

function isOwner(userId) {
  return Number(userId) === Number(OWNER_ID);
}

async function getGenericCooldown(userId, column, cooldownMs) {
  if (isOwner(userId)) return 0; // владелец всегда может играть

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
🎳 Боулинг: ${getRemaining(stats.last_bowling_at, BOWLING_COOLDOWN_MS)}
✂️ КНБ: ${getRemaining(stats.last_knb_at, KNB_COOLDOWN_MS)}`;
}

// =========================
// PROFILE
// =========================
async function getProfileText(user) {
  await initUser(user);
  const stats = await getUserStats(user.id);
  const shield = await getShieldRow(user.id);
  const levelInfo = getLevelInfoByXp(Number(stats.xp || 0));
  const wanted = await getWantedRow(user.id);
  const layLow = await getLayLowStatus(user.id);

  const layLowText =
    layLow && layLow.is_active
      ? `✅ Да (${formatRemainingTime(new Date(layLow.until_at).getTime() - Date.now())})`
      : "❌ Нет";

  return `👤 Профиль пользователя

Имя: ${getUserLink(user)}
ID: ${user.id}

💰 Монеты: ${stats.balance || 0}
🤝 Респект: ${stats.respect || 0}
🛡 Щиты: ${Number(shield?.count || 0)}/${MAX_SHIELDS}
⭐ Уровень: ${Number(stats.level || 1)}
🚨 Розыск: ${Number(wanted?.level || 0)}/${MAX_WANTED_LEVEL}
🕶 Скрытность: ${layLowText}

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
❄️ Кинули снежок: ${stats.snowballs}

🔥 Всего взаимодействий: ${stats.total}
📈 Опыт: ${levelInfo.xp}${levelInfo.isMax ? " (макс)" : ` | до след. уровня: ${levelInfo.remaining}`}`;
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
  await ensureCoupleState(request.fromUser.id, request.targetUser.id);

  if (messageId) await removeInlineKeyboard(chatId, messageId);
  deleteMarriageRequest(request);

  let text = `💍 Брак зарегистрирован!

${getUserLink(request.fromUser)} + ${getUserLink(request.targetUser)}

📅 Дата: ${formatDate(marriage.created_at)}
🏡 Теперь вы семья!`;

  text = await appendLevelUpIfNeeded(text, request.fromUser.id, 15);
  text = await appendLevelUpIfNeeded(text, request.targetUser.id, 15);

  await safeSendMessage(chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
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

  await ensureChildObedience(request.childUser.id);

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

  successText = await appendLevelUpIfNeeded(successText, request.parentUser.id, 15);
  successText = await appendLevelUpIfNeeded(successText, request.childUser.id, 12);

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
// BOMB
// =========================
function getBombChatKey(chatId) {
  return String(chatId);
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
    `💣 ${getUserLink(fromUser)} передал бомбу!

🔥 Теперь бомба у: ${getUserLink(nextHolder)}
⏳ У него 5 секунд, чтобы написать: передать`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  await startBombTimer(chatId);
  return true;
}

// =========================
// ROBBERY DIFFICULTY
// =========================
async function getCrimeBonuses(userId) {
  const inventory = await getFullInventory(userId);

  return {
    mask: Number(inventory.mask || 0) > 0,
    lockpick: Number(inventory.lockpick || 0) > 0,
    radio: Number(inventory.radio || 0) > 0,
    armor: Number(inventory.armor || 0) > 0,
    fakePassport: Number(inventory.fake_passport || 0) > 0,
    jammer: Number(inventory.jammer || 0) > 0
  };
}

function getRandomRobberyResult(targetBalance, wantedLevel, bonuses) {
  const wanted = Number(wantedLevel || 0);
  let successChance = 0.30;
  let bigChance = 0.07;

  if (bonuses.mask) successChance += 0.05;
  if (bonuses.lockpick) successChance += 0.03;
  if (bonuses.radio) successChance += 0.02;
  if (bonuses.armor) successChance += 0.02;

  successChance -= wanted * 0.04;
  bigChance -= wanted * 0.01;

  successChance = clamp(successChance, 0.10, 0.46);
  bigChance = clamp(bigChance, 0.02, 0.10);

  const roll = Math.random();

  if (roll > successChance) {
    return { type: "fail", amount: 0 };
  }

  const isBig = Math.random() < bigChance;
  const maxSteal = Math.max(1, Math.floor(targetBalance * (isBig ? 0.22 : 0.10)));
  const minSteal = isBig ? 12 : 2;
  const amount = clamp(Math.floor(Math.random() * maxSteal) + minSteal, 1, targetBalance);

  return {
    type: isBig ? "big" : "small",
    amount
  };
}

async function robberyTransfer(thiefId, victimId, requestedAmount) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const thiefRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [thiefId]
    );
    const victimRow = await client.query(
      `SELECT balance FROM users WHERE user_id = $1 FOR UPDATE`,
      [victimId]
    );

    if (!thiefRow.rows[0] || !victimRow.rows[0]) throw new Error("USER_NOT_FOUND");

    const victimBalance = Number(victimRow.rows[0].balance || 0);
    const actualAmount = Math.min(victimBalance, requestedAmount);

    if (actualAmount <= 0) throw new Error("VICTIM_NO_MONEY");

    const updatedVictim = await client.query(
      `UPDATE users SET balance = balance - $2 WHERE user_id = $1 RETURNING balance`,
      [victimId, actualAmount]
    );

    const updatedThief = await client.query(
      `UPDATE users SET balance = balance + $2 WHERE user_id = $1 RETURNING balance`,
      [thiefId, actualAmount]
    );

    await client.query("COMMIT");

    return {
      stolen: actualAmount,
      thiefBalance: Number(updatedThief.rows[0].balance || 0),
      victimBalance: Number(updatedVictim.rows[0].balance || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// =========================
// ATM HACK
// =========================
function getAtmHackOutcome(wantedLevel, bonuses) {
  const wanted = Number(wantedLevel || 0);

  let successChance = 0.24;
  let jackpotChance = 0.03;

  if (bonuses.lockpick) successChance += 0.08;
  if (bonuses.jammer) successChance += 0.05;
  if (bonuses.mask) successChance += 0.03;
  if (bonuses.radio) successChance += 0.02;

  successChance -= wanted * 0.04;
  jackpotChance -= wanted * 0.005;

  successChance = clamp(successChance, 0.08, 0.44);
  jackpotChance = clamp(jackpotChance, 0.01, 0.05);

  const roll = Math.random();

  if (roll > successChance) {
    return { type: "fail", coins: 0 };
  }

  if (Math.random() < jackpotChance) {
    return { type: "jackpot", coins: Math.floor(Math.random() * 21) + 25 };
  }

  return { type: "success", coins: Math.floor(Math.random() * 12) + 8 };
}

// =========================
// JEWELRY HEIST
// =========================
function getJewelryHeistOutcome(wantedLevel, bonuses) {
  const wanted = Number(wantedLevel || 0);

  let successChance = 0.22;
  let jackpotChance = 0.04;

  if (bonuses.mask) successChance += 0.05;
  if (bonuses.armor) successChance += 0.04;
  if (bonuses.jammer) successChance += 0.04;
  if (bonuses.fakePassport) successChance += 0.02;
  if (bonuses.radio) successChance += 0.02;

  successChance -= wanted * 0.045;
  jackpotChance -= wanted * 0.006;

  successChance = clamp(successChance, 0.08, 0.42);
  jackpotChance = clamp(jackpotChance, 0.01, 0.05);

  const roll = Math.random();

  if (roll > successChance) {
    if (roll > 0.92) return { type: "disaster", coins: 0 };
    return { type: "fail", coins: 0 };
  }

  if (Math.random() < jackpotChance) {
    return { type: "jackpot", coins: Math.floor(Math.random() * 51) + 80 };
  }

  if (Math.random() < 0.35) {
    return { type: "big", coins: Math.floor(Math.random() * 31) + 35 };
  }

  return { type: "small", coins: Math.floor(Math.random() * 16) + 15 };
}

// =========================
// BANK HEIST
// =========================
function getBankHeistChatKey(chatId) {
  return String(chatId);
}

function getBankHeist(chatId) {
  return activeBankHeists[getBankHeistChatKey(chatId)] || null;
}

function clearBankHeist(chatId) {
  delete activeBankHeists[getBankHeistChatKey(chatId)];
}

function createBankHeist(chatId, leaderUser) {
  const key = getBankHeistChatKey(chatId);

  activeBankHeists[key] = {
    chatId,
    leaderId: Number(leaderUser.id),
    stage: "gathering",
    policeAlert: false,
    loot: 0,
    createdAt: Date.now(),
    members: {
      [String(leaderUser.id)]: {
        id: Number(leaderUser.id),
        first_name: leaderUser.first_name || "",
        last_name: leaderUser.last_name || "",
        username: leaderUser.username || ""
      }
    }
  };

  return activeBankHeists[key];
}

function getHeistMembersList(heist) {
  return Object.values(heist?.members || {});
}

function getHeistMemberCount(heist) {
  return getHeistMembersList(heist).length;
}

function isHeistParticipant(heist, userId) {
  return !!heist?.members?.[String(userId)];
}

async function getHeistTeamStats(heist) {
  const members = getHeistMembersList(heist);

  let masks = 0;
  let radios = 0;
  let armors = 0;
  let jammers = 0;
  let passports = 0;
  let lockpicks = 0;
  let wantedSum = 0;

  for (const user of members) {
    const inv = await getFullInventory(user.id);
    if (Number(inv.mask || 0) > 0) masks++;
    if (Number(inv.radio || 0) > 0) radios++;
    if (Number(inv.armor || 0) > 0) armors++;
    if (Number(inv.jammer || 0) > 0) jammers++;
    if (Number(inv.fake_passport || 0) > 0) passports++;
    if (Number(inv.lockpick || 0) > 0) lockpicks++;

    const wanted = await getWantedRow(user.id);
    wantedSum += Number(wanted?.level || 0);
  }

  return {
    members: members.length,
    masks,
    radios,
    armors,
    jammers,
    passports,
    lockpicks,
    avgWanted: members.length ? wantedSum / members.length : 0
  };
}

function getBankEntryOutcome(stats) {
  let successChance = 0.20;
  successChance += stats.masks * 0.04;
  successChance += stats.radios * 0.03;
  successChance += stats.jammers * 0.04;
  successChance += stats.armors * 0.02;
  successChance -= stats.avgWanted * 0.05;

  successChance = clamp(successChance, 0.08, 0.46);

  const roll = Math.random();

  if (roll < successChance * 0.45) return { type: "clean_success" };
  if (roll < successChance) return { type: "noisy_success" };
  if (roll < 0.82) return { type: "partial_fail_alarm" };
  return { type: "total_fail" };
}

function getVaultOutcome(stats, policeAlert) {
  let jackpotChance = 0.01;
  let fullChance = 0.08;
  let mediumChance = 0.20;
  let smallChance = 0.25;

  fullChance += stats.lockpicks * 0.02;
  fullChance += stats.jammers * 0.02;
  mediumChance += stats.radios * 0.02;
  mediumChance += stats.masks * 0.01;
  fullChance -= stats.avgWanted * 0.03;
  mediumChance -= stats.avgWanted * 0.02;

  if (policeAlert) {
    jackpotChance -= 0.003;
    fullChance -= 0.04;
    mediumChance -= 0.05;
    smallChance -= 0.05;
  }

  jackpotChance = clamp(jackpotChance, 0.005, 0.02);
  fullChance = clamp(fullChance, 0.03, 0.16);
  mediumChance = clamp(mediumChance, 0.08, 0.28);
  smallChance = clamp(smallChance, 0.10, 0.30);

  const roll = Math.random();

  if (roll < jackpotChance) {
    return { type: "jackpot", loot: Math.floor(Math.random() * 61) + 180 };
  }

  if (roll < jackpotChance + fullChance) {
    return { type: "success", loot: Math.floor(Math.random() * 61) + 95 };
  }

  if (roll < jackpotChance + fullChance + mediumChance) {
    return { type: "medium", loot: Math.floor(Math.random() * 36) + 45 };
  }

  if (roll < jackpotChance + fullChance + mediumChance + smallChance) {
    return { type: "small", loot: Math.floor(Math.random() * 16) + 12 };
  }

  if (roll < 0.90) {
    return { type: "fail_alarm", loot: 0 };
  }

  return { type: "disaster", loot: 0 };
}

function getBankEscapeOutcome(stats, loot, policeAlert) {
  let fullEscapeChance = 0.10;
  fullEscapeChance += stats.radios * 0.04;
  fullEscapeChance += stats.armors * 0.03;
  fullEscapeChance += stats.masks * 0.02;
  fullEscapeChance += stats.passports * 0.03;
  fullEscapeChance -= stats.avgWanted * 0.04;

  if (policeAlert) fullEscapeChance -= 0.08;
  if (loot >= 60) fullEscapeChance -= 0.02;
  if (loot >= 100) fullEscapeChance -= 0.03;
  if (loot >= 160) fullEscapeChance -= 0.05;

  fullEscapeChance = clamp(fullEscapeChance, 0.02, 0.28);

  const partialEscapeChance = fullEscapeChance + 0.24;
  const oneCaughtChance = partialEscapeChance + 0.28;

  const roll = Math.random();

  if (roll < fullEscapeChance) return { type: "full_escape" };
  if (roll < partialEscapeChance) return { type: "half_escape" };
  if (roll < oneCaughtChance) return { type: "one_caught" };
  return { type: "all_caught" };
}

// =========================
// VAN HEIST
// =========================
function getVanHeistChatKey(chatId) {
  return String(chatId);
}

function getVanHeist(chatId) {
  return activeVanHeists[getVanHeistChatKey(chatId)] || null;
}

function clearVanHeist(chatId) {
  delete activeVanHeists[getVanHeistChatKey(chatId)];
}

function createVanHeist(chatId, leaderUser) {
  const key = getVanHeistChatKey(chatId);

  activeVanHeists[key] = {
    chatId,
    leaderId: Number(leaderUser.id),
    stage: "gathering",
    policeAlert: false,
    loot: 0,
    createdAt: Date.now(),
    members: {
      [String(leaderUser.id)]: {
        id: Number(leaderUser.id),
        first_name: leaderUser.first_name || "",
        last_name: leaderUser.last_name || "",
        username: leaderUser.username || ""
      }
    }
  };

  return activeVanHeists[key];
}

function getVanMembersList(van) {
  return Object.values(van?.members || {});
}

function getVanMemberCount(van) {
  return getVanMembersList(van).length;
}

function isVanParticipant(van, userId) {
  return !!van?.members?.[String(userId)];
}

async function getVanTeamStats(van) {
  const members = getVanMembersList(van);

  let masks = 0;
  let radios = 0;
  let armors = 0;
  let jammers = 0;
  let passports = 0;
  let wantedSum = 0;

  for (const user of members) {
    const inv = await getFullInventory(user.id);
    if (Number(inv.mask || 0) > 0) masks++;
    if (Number(inv.radio || 0) > 0) radios++;
    if (Number(inv.armor || 0) > 0) armors++;
    if (Number(inv.jammer || 0) > 0) jammers++;
    if (Number(inv.fake_passport || 0) > 0) passports++;

    const wanted = await getWantedRow(user.id);
    wantedSum += Number(wanted?.level || 0);
  }

  return {
    members: members.length,
    masks,
    radios,
    armors,
    jammers,
    passports,
    avgWanted: members.length ? wantedSum / members.length : 0
  };
}

function getVanAttackOutcome(stats) {
  let successChance = 0.18;
  successChance += stats.masks * 0.04;
  successChance += stats.radios * 0.03;
  successChance += stats.armors * 0.04;
  successChance += stats.jammers * 0.03;
  successChance -= stats.avgWanted * 0.04;

  successChance = clamp(successChance, 0.08, 0.42);

  const roll = Math.random();
  if (roll < successChance * 0.35) return { type: "clean_success" };
  if (roll < successChance) return { type: "success_alarm" };
  if (roll < 0.82) return { type: "partial_fail" };
  return { type: "disaster" };
}

function getVanEscapeOutcome(stats, loot, policeAlert) {
  let chance = 0.12;
  chance += stats.radios * 0.05;
  chance += stats.armors * 0.04;
  chance += stats.passports * 0.03;
  chance -= stats.avgWanted * 0.04;

  if (policeAlert) chance -= 0.08;
  if (loot >= 50) chance -= 0.03;
  if (loot >= 90) chance -= 0.04;

  chance = clamp(chance, 0.03, 0.28);

  const roll = Math.random();
  if (roll < chance) return { type: "full_escape" };
  if (roll < chance + 0.25) return { type: "partial_escape" };
  if (roll < chance + 0.53) return { type: "one_caught" };
  return { type: "all_caught" };
}

// =========================
// GAME ACTIONS
// =========================
async function claimDailyCoins(userId) {
  const result = await pool.query(`SELECT balance, last_daily_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastDailyAt = row.last_daily_at ? new Date(row.last_daily_at) : null;

  if (lastDailyAt) {
    const nextTime = new Date(lastDailyAt.getTime() + MONEY_COOLDOWN_MS);
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

  return { ok: true, coins, balance: Number(updateResult.rows[0].balance || 0) };
}

async function runHunt(userId) {
  const result = await pool.query(`SELECT balance, last_hunt_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastHuntAt = row.last_hunt_at ? new Date(row.last_hunt_at) : null;

  if (lastHuntAt) {
    const nextTime = new Date(lastHuntAt.getTime() + HUNT_COOLDOWN_MS);
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

  return { ok: true, hunt, balance: Number(updateResult.rows[0].balance || 0) };
}

async function runSniper(userId) {
  const result = await pool.query(`SELECT balance, last_sniper_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastSniperAt = row.last_sniper_at ? new Date(row.last_sniper_at) : null;

  if (lastSniperAt) {
    const nextTime = new Date(lastSniperAt.getTime() + SNIPER_COOLDOWN_MS);
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

  return { ok: true, sniper, balance: Number(updateResult.rows[0].balance || 0) };
}

async function runBasketball(userId) {
  const result = await pool.query(`SELECT balance, last_basketball_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastAt = row.last_basketball_at ? new Date(row.last_basketball_at) : null;

  if (lastAt) {
    const nextTime = new Date(lastAt.getTime() + BASKETBALL_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
    }
  }

  const game = getBasketballResult();
  let newBalance = Number(row.balance || 0) + Number(game.coins || 0);
  if (newBalance < 0) newBalance = 0;

  const updateResult = await pool.query(
    `
    UPDATE users
    SET balance = $2,
        last_basketball_at = NOW()
    WHERE user_id = $1
    RETURNING balance
    `,
    [userId, newBalance]
  );

  return {
    ok: true,
    game,
    balance: Number(updateResult.rows[0].balance || 0)
  };
}

async function runBowling(userId) {
  const result = await pool.query(
    `SELECT balance, last_bowling_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastAt = row.last_bowling_at ? new Date(row.last_bowling_at) : null;

  if (lastAt) {
    const nextTime = new Date(lastAt.getTime() + BOWLING_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
    }
  }

  return { ok: true };
}

async function runKnb(userId, playerChoice) {
  const result = await pool.query(`SELECT balance, last_knb_at FROM users WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) return { ok: false, reason: "not_found" };

  const row = result.rows[0];
  const now = new Date();
  const lastAt = row.last_knb_at ? new Date(row.last_knb_at) : null;

  if (lastAt) {
    const nextTime = new Date(lastAt.getTime() + KNB_COOLDOWN_MS);
    if (now < nextTime) {
      return { ok: false, remainingMs: nextTime.getTime() - now.getTime() };
    }
  }

  const botChoice = getKnbBotChoiceRareWin(playerChoice);
  const game = resolveKnb(playerChoice, botChoice);

  let newBalance = Number(row.balance || 0) + Number(game.coins || 0);
  if (newBalance < 0) newBalance = 0;

  const updateResult = await pool.query(
    `
    UPDATE users
    SET balance = $2,
        last_knb_at = NOW()
    WHERE user_id = $1
    RETURNING balance
    `,
    [userId, newBalance]
  );

  return {
    ok: true,
    game,
    botChoice,
    balance: Number(updateResult.rows[0].balance || 0)
  };
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

<b>🛡 Модерация</b>
• /admins
• /antispam on
• /antispam off
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
// АНТИ-СПАМ С МУТОМ (Node-Telegram-Bot-API)
// =========================
const spamSettings = {
  enabled: true,
  messageLimit: 5,
  interval: 5000,
  muteTime: 60000 // 60 сек
};

const userMessageMap = new Map();
const mutedUsers = new Map();

// формат времени (сек/мин/час)
function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} сек`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const hr = Math.floor(min / 60);
  return `${hr} ч`;
}

// Проверка админа/владельца
async function isOwnerOrAdmin(msg) {
  const userId = msg.from.id;
  if (userId === OWNER_ID) return true;
  if (msg.chat.type === 'private') return false;

  try {
    const member = await bot.getChatMember(msg.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch {
    return false;
  }
}

// Вкл/выкл антиспам
bot.onText(/\/antispam (on|off)/, async (msg, match) => {
  const allowed = await isOwnerOrAdmin(msg);
  if (!allowed) return bot.sendMessage(msg.chat.id, '❌ Только админы или владелец');

  spamSettings.enabled = match[1] === 'on';
  bot.sendMessage(msg.chat.id, `✅ Анти-спам ${spamSettings.enabled ? 'включен' : 'выключен'}`);
});

// Проверка сообщений
bot.on('message', async (msg) => {
  if (!spamSettings.enabled) return;
  if (msg.chat.type === 'private') return;
  if (msg.text && msg.text.startsWith('/')) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const now = Date.now();

  if (mutedUsers.has(userId)) return;

  if (!userMessageMap.has(userId)) userMessageMap.set(userId, []);
  const timestamps = userMessageMap.get(userId);
  timestamps.push(now);

  while (timestamps.length && now - timestamps[0] > spamSettings.interval) {
    timestamps.shift();
  }

  if (timestamps.length > spamSettings.messageLimit) {
    const userName = msg.from.first_name || "Игрок";
    const muteText = formatTime(spamSettings.muteTime);

    try {
      await bot.restrictChatMember(chatId, userId, {
        can_send_messages: false,
        until_date: Math.floor((now + spamSettings.muteTime) / 1000)
      });

      mutedUsers.set(userId, true);

      bot.sendMessage(chatId,
        `🔇 ${userName} лишается права слова на ${muteText}\n💬 Причина: спам`
      );

      setTimeout(async () => {
        try {
          await bot.restrictChatMember(chatId, userId, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false
          });

          mutedUsers.delete(userId);

          bot.sendMessage(chatId,
            `✅ ${userName} снова может писать в чате`
          );

        } catch (err) {
          console.error('Ошибка при снятии мута:', err);
        }
      }, spamSettings.muteTime);

    } catch (err) {
      console.error('Ошибка при муте:', err);
    }

    userMessageMap.set(userId, []);
  }
});;

// =========================
// /admins
// =========================
bot.onText(/\/admins/, async (msg) => {
  const chatId = msg.chat.id;

  // работает только в группе
  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, '❌ Команда только для группы');
  }

  try {
    const admins = await bot.getChatAdministrators(chatId);

    let text = '👮 Админы группы:\n\n';

    for (const admin of admins) {
      const user = admin.user;
      const name = user.first_name || 'Без имени';
      text += `• ${name}\n`;
    }

    bot.sendMessage(chatId, text);

  } catch (err) {
    console.error('Ошибка /admins:', err);
    bot.sendMessage(chatId, '❌ Не удалось получить список админов');
  }
});
