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

const chatMembers = {};
const recentActiveUsers = {};
const activeBombs = {};
const activeBankHeists = {};
const pendingCommandCreation = {};

const pendingMarriagesByRequestId = {};
const pendingMarriagesByUserKey = {};
const pendingAdoptionsByRequestId = {};
const pendingAdoptionsByUserKey = {};

const MONEY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SNIPER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const ROBBERY_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BANK_HEIST_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const BASKETBALL_COOLDOWN_MS = 60 * 60 * 1000;
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

const POLICE_JAIL_MS = 60 * 60 * 1000;

const SHIELD_COST = 250;
const MAX_SHIELDS = 3;

const JAIL_ESCAPE_COOLDOWN_MS = 20 * 60 * 1000;
const JAIL_LAWYER_COOLDOWN_MS = 20 * 60 * 1000;
const JAIL_BRIBE_COOLDOWN_MS = 20 * 60 * 1000;
const JAIL_LAWYER_COST = 250;
const JAIL_BRIBE_COST = 400;

const TIME_EDIT_MAX_MINUTES = 10080;

const BANK_HEIST_MIN_MEMBERS = 2;
const BANK_HEIST_MAX_MEMBERS = 4;
const BANK_MASK_COST = 35;

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

function formatDateTime(dateValue) {
  const date = new Date(dateValue);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${mins}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function getBasketballResult() {
  const roll = Math.random();

  if (roll < 0.12) {
    return {
      type: "jackpot",
      text: "🏀 Идеальный дальний бросок! Мяч залетел очень красиво.",
      coins: Math.floor(Math.random() * 31) + 30
    };
  }

  if (roll < 0.32) {
    return {
      type: "win",
      text: "🏀 Попал! Хороший бросок.",
      coins: Math.floor(Math.random() * 11) + 10
    };
  }

  return {
    type: "fail",
    text: "❌ Промах. Мяч отскочил от кольца.",
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

  if (roll < 0.15) return beats[playerChoice];
  if (roll < 0.45) return playerChoice;
  return losesTo[playerChoice];
}

function resolveKnb(playerChoice, botChoice) {
  if (playerChoice === botChoice) {
    return {
      type: "draw",
      text: "🤝 Ничья.",
      coins: 0
    };
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
      coins: Math.floor(Math.random() * 8) + 8
    };
  }

  return {
    type: "lose",
    text: "💀 Бот выиграл.",
    coins: -(Math.floor(Math.random() * 5) + 4)
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

function getCooldownColumnAndMsByName(rawName) {
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

  if (["ограбление банка", "банк", "heist", "bank"].includes(name)) {
    return { column: "last_bank_at", cooldownMs: BANK_HEIST_COOLDOWN_MS, title: "ограбление банка" };
  }

  if (["баскетбол", "basketball"].includes(name)) {
    return { column: "last_basketball_at", cooldownMs: BASKETBALL_COOLDOWN_MS, title: "баскетбол" };
  }

  if (["кнб", "rps", "камень", "ножницы", "бумага"].includes(name)) {
    return { column: "last_knb_at", cooldownMs: KNB_COOLDOWN_MS, title: "кнб" };
  }

  return null;
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
// BANK HEIST
// =========================
function getBankHeistChatKey(chatId) {
  return String(chatId);
}

function clearBankHeist(chatId) {
  delete activeBankHeists[getBankHeistChatKey(chatId)];
}

function getBankHeist(chatId) {
  return activeBankHeists[getBankHeistChatKey(chatId)] || null;
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

function getMaskedMembersCount(heist) {
  return getHeistMembersList(heist).filter((m) => m.hasMask).length;
}

function getHeistStageText(stage) {
  if (stage === "gathering") return "сбор команды";
  if (stage === "inside") return "внутри банка";
  if (stage === "escape") return "побег";
  return "неизвестно";
}

function getHeistMembersText(heist) {
  const members = getHeistMembersList(heist);
  if (!members.length) return "нет";

  return members
    .map((member, index) => {
      const crown = Number(member.id) === Number(heist.leaderId) ? "👑 " : "";
      const mask = member.hasMask ? "🎭" : "❌";
      return `${index + 1}. ${crown}${getUserLink(member)} — маска: ${mask}`;
    })
    .join("\n");
}

function getHeistStatusText(heist) {
  if (!heist) return "❌ В этом чате сейчас нет активного ограбления банка.";

  const policeText = heist.policeAlert ? "🚨 полиция настороже" : "😶 пока тихо";
  const masked = getMaskedMembersCount(heist);

  return `🏦 Ограбление банка

👑 Лидер: ${getUserLink(heist.members[String(heist.leaderId)])}
📍 Этап: ${escapeHtml(getHeistStageText(heist.stage))}
👥 Команда: ${getHeistMemberCount(heist)}/${BANK_HEIST_MAX_MEMBERS}
🎭 Маски: ${masked}/${getHeistMemberCount(heist)}
🚔 Полиция: ${policeText}
💰 Добыча: ${Number(heist.loot || 0)} монет

Участники:
${getHeistMembersText(heist)}

Команды:
• присоединиться к ограблению
• купить маску
• статус ограбления
• начать штурм
• вскрыть сейф
• сбежать с банка
• отменить ограбление`;
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
    startedAt: null,
    members: {
      [String(leaderUser.id)]: {
        id: Number(leaderUser.id),
        first_name: leaderUser.first_name || "",
        last_name: leaderUser.last_name || "",
        username: leaderUser.username || "",
        hasMask: false
      }
    }
  };

  return activeBankHeists[key];
}

async function addUserToBankHeist(chatId, user) {
  const heist = getBankHeist(chatId);
  if (!heist) return { ok: false, reason: "no_heist" };

  if (heist.stage !== "gathering") {
    return { ok: false, reason: "already_started" };
  }

  if (isHeistParticipant(heist, user.id)) {
    return { ok: false, reason: "already_member" };
  }

  const count = getHeistMemberCount(heist);
  if (count >= BANK_HEIST_MAX_MEMBERS) {
    return { ok: false, reason: "team_full" };
  }

  heist.members[String(user.id)] = {
    id: Number(user.id),
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    username: user.username || "",
    hasMask: false
  };

  return { ok: true, heist };
}

async function buyMaskForHeistMember(chatId, userId) {
  const heist = getBankHeist(chatId);
  if (!heist) throw new Error("NO_HEIST");
  if (heist.stage !== "gathering") throw new Error("WRONG_STAGE");
  if (!isHeistParticipant(heist, userId)) throw new Error("NOT_MEMBER");

  const member = heist.members[String(userId)];
  if (member.hasMask) throw new Error("ALREADY_HAVE_MASK");

  const result = await deductCoinsExact(userId, BANK_MASK_COST);
  if (!result.ok) throw new Error("NOT_ENOUGH_MONEY");

  member.hasMask = true;

  return {
    heist,
    userBalance: result.balance
  };
}

function getBankEntryOutcome(heist) {
  const members = getHeistMemberCount(heist);
  const masks = getMaskedMembersCount(heist);

  let cleanSuccessChance = 0.20;
  cleanSuccessChance += members * 0.12;
  cleanSuccessChance += masks * 0.10;
  cleanSuccessChance = Math.min(cleanSuccessChance, 0.78);

  const noisySuccessChance = cleanSuccessChance + 0.17;

  const roll = Math.random();

  if (roll < cleanSuccessChance) {
    return { type: "clean_success" };
  }

  if (roll < noisySuccessChance) {
    return { type: "noisy_success" };
  }

  if (roll < noisySuccessChance + 0.13) {
    return { type: "partial_fail_alarm" };
  }

  return { type: "total_fail" };
}

function getVaultOutcome(heist) {
  const members = getHeistMemberCount(heist);
  const masks = getMaskedMembersCount(heist);

  let jackpotChance = 0.10 + masks * 0.05;
  let successChance = 0.34 + members * 0.07 + masks * 0.06;
  if (heist.policeAlert) {
    jackpotChance -= 0.04;
    successChance -= 0.10;
  }

  jackpotChance = clamp(jackpotChance, 0.03, 0.32);
  successChance = clamp(successChance, 0.18, 0.72);

  const roll = Math.random();

  if (roll < jackpotChance) {
    return {
      type: "jackpot",
      loot: Math.floor(Math.random() * 151) + 450
    };
  }

  if (roll < successChance) {
    return {
      type: "success",
      loot: Math.floor(Math.random() * 161) + 240
    };
  }

  if (roll < successChance + 0.18) {
    return {
      type: "small",
      loot: Math.floor(Math.random() * 111) + 100
    };
  }

  if (roll < successChance + 0.33) {
    return {
      type: "fail_alarm",
      loot: 0
    };
  }

  return {
    type: "disaster",
    loot: 0
  };
}

function getEscapeOutcome(heist) {
  const members = getHeistMemberCount(heist);
  const masks = getMaskedMembersCount(heist);
  const loot = Number(heist.loot || 0);

  let fullEscapeChance = 0.26 + members * 0.07 + masks * 0.07;
  if (heist.policeAlert) fullEscapeChance -= 0.18;
  if (loot >= 450) fullEscapeChance -= 0.08;
  if (loot >= 600) fullEscapeChance -= 0.06;
  fullEscapeChance = clamp(fullEscapeChance, 0.08, 0.72);

  const partialEscapeChance = fullEscapeChance + 0.28;
  const caughtOneChance = partialEscapeChance + 0.23;

  const roll = Math.random();

  if (roll < fullEscapeChance) return { type: "full_escape" };
  if (roll < partialEscapeChance) return { type: "half_escape" };
  if (roll < caughtOneChance) return { type: "one_caught" };
  return { type: "all_caught" };
}

async function updateBankHeistCooldownForUsers(userIds) {
  if (!Array.isArray(userIds) || !userIds.length) return;
  await pool.query(
    `UPDATE users SET last_bank_at = NOW() WHERE user_id = ANY($1::bigint[])`,
    [userIds.map((id) => Number(id))]
  );
}

async function getBankHeistCooldown(userId) {
  const result = await pool.query(
    `SELECT last_bank_at FROM users WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row || !row.last_bank_at) return 0;

  const nextTime = new Date(new Date(row.last_bank_at).getTime() + BANK_HEIST_COOLDOWN_MS);
  const diff = nextTime.getTime() - Date.now();

  return diff > 0 ? diff : 0;
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

async function punishHeistMembersWithPolice(chatId, heist, mode, extraText = "") {
  const members = getHeistMembersList(heist);
  const memberIds = members.map((m) => Number(m.id));
  await updateBankHeistCooldownForUsers(memberIds);

  if (mode === "total_fail_before_entry") {
    const arrestedCount = members.length >= 3 ? 2 : 1;
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const arrested = shuffled.slice(0, arrestedCount);
    const fined = shuffled.slice(arrestedCount);

    for (const user of arrested) {
      await sendUserToJail(user.id, POLICE_JAIL_MS);
    }

    let text = `🚔 Ограбление банка сорвалось ещё на входе!

${extraText ? `${extraText}\n` : ""}Полиция приехала слишком быстро.`;

    if (arrested.length) {
      text += `\n\n⛓ Арестованы:\n${arrested.map((u) => `• ${getUserLink(u)}`).join("\n")}`;
    }

    if (fined.length) {
      for (const user of fined) {
        try {
          await deductCoinsSafe(user.id, Math.floor(Math.random() * 21) + 20);
        } catch (error) {
          console.error("Ошибка штрафа банка:", error);
        }
      }

      text += `\n\n💸 Остальным удалось уйти, но они получили штрафы.`;
    }

    clearBankHeist(chatId);

    await safeSendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    return;
  }

  if (mode === "vault_disaster") {
    for (const user of members) {
      await sendUserToJail(user.id, POLICE_JAIL_MS);
    }

    clearBankHeist(chatId);

    await safeSendMessage(
      chatId,
      `🚨 Во время вскрытия сейфа всё пошло очень плохо!

${extraText ? `${extraText}\n` : ""}Сработала защита банка и полиция окружила здание.

⛓ Вся команда арестована:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
    return;
  }

  if (mode === "all_caught_escape") {
    for (const user of members) {
      await sendUserToJail(user.id, POLICE_JAIL_MS);
    }

    clearBankHeist(chatId);

    await safeSendMessage(
      chatId,
      `🚔 Побег не удался.

${extraText ? `${extraText}\n` : ""}Полиция догнала всю команду.

⛓ В тюрьму отправлены:
${members.map((u) => `• ${getUserLink(u)}`).join("\n")}

💰 Добыча потеряна.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  }
}

async function rewardHeistMembers(chatId, heist, totalLoot, options = {}) {
  const members = getHeistMembersList(heist);
  const memberIds = members.map((m) => Number(m.id));
  await updateBankHeistCooldownForUsers(memberIds);

  const activeMembers = options.activeMembers || members;
  const share = Math.floor(totalLoot / activeMembers.length);
  let leftover = totalLoot - share * activeMembers.length;

  const lines = [];

  for (const user of activeMembers) {
    let amount = share;
    if (leftover > 0) {
      amount += 1;
      leftover -= 1;
    }
    const newBalance = await addCoinsToUser(user.id, amount);
    lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
  }

  clearBankHeist(chatId);

  await safeSendMessage(
    chatId,
    `${options.title || "💰 Ограбление банка удалось!"}

${options.subtitle ? `${options.subtitle}\n\n` : ""}Раздел добычи:
${lines.join("\n")}`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );
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
      last_robbery_at TIMESTAMPTZ,
      last_bank_at TIMESTAMPTZ,
      last_basketball_at TIMESTAMPTZ,
      last_knb_at TIMESTAMPTZ,
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

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_robbery_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bank_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_basketball_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_knb_at TIMESTAMPTZ`);

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

async function addCoinsToUser(userId, amount) {
  const result = await pool.query(
    `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE user_id = $1 RETURNING balance`,
    [userId, amount]
  );
  return Number(result.rows[0]?.balance || 0);
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
    if (!parsed) {
      throw new Error("BAD_PAYMENT_PAYLOAD");
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

    if (currentShields >= MAX_SHIELDS) {
      throw new Error("MAX_SHIELDS_REACHED");
    }

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

async function deleteCoupleStateByUsers(user1Id, user2Id) {
  const coupleKey = getCoupleKeyByUserIds(user1Id, user2Id);
  await pool.query(`DELETE FROM couple_states WHERE couple_key = $1`, [coupleKey]);
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

  const actorParents = await getActiveAdoptionByChildId(parentUserId);
  if (actorParents) {
    return { ok: false, reason: "actor_is_child", text: "❌ Игрок в роли ребёнка не может усыновлять других." };
  }

  const targetParentInfo = await getActiveAdoptionByChildId(targetUserId);
  if (targetParentInfo) {
    return {
      ok: false,
      reason: "already_adopted",
      text: "❌ Этот игрок уже ребёнок в другой семье. Выбери другого ребёнка."
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
// PUNISHMENTS
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

// =========================
// OBEDIENCE / GOOD DEEDS
// =========================
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
// ROBBERY / POLICE / JAIL
// =========================
function getRandomRobberyResult() {
  const roll = Math.random();

  if (roll < 0.60) {
    return { type: "fail", amount: 0 };
  }

  if (roll < 0.90) {
    return {
      type: "small",
      amount: Math.floor(Math.random() * 10) + 1
    };
  }

  return {
    type: "big",
    amount: Math.floor(Math.random() * 16) + 15
  };
}

function getRandomPoliceOutcome() {
  const roll = Math.random();

  if (roll < 0.50) return { type: "none" };
  if (roll < 0.80) return { type: "fine", amount: Math.floor(Math.random() * 8) + 3 };
  if (roll < 0.90) return { type: "return" };
  return { type: "jail" };
}

function getRandomEscapeOutcome() {
  const roll = Math.random();
  if (roll < 0.35) return { type: "success" };
  if (roll < 0.70) return { type: "fail" };
  return { type: "caught_more_time", extraMs: 30 * 60 * 1000 };
}

function getRandomLawyerOutcome() {
  const roll = Math.random();
  if (roll < 0.15) return { type: "free" };
  if (roll < 0.70) return { type: "reduce", reduceMs: (20 + Math.floor(Math.random() * 21)) * 60 * 1000 };
  return { type: "fail" };
}

function getRandomBribeOutcome() {
  const roll = Math.random();
  if (roll < 0.40) return { type: "free" };
  if (roll < 0.75) return { type: "fail" };
  return { type: "caught_more_time", extraMs: 45 * 60 * 1000 };
}

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
    SELECT user_id, last_escape_at, last_lawyer_at, last_bribe_at, updated_at
    FROM jail_actions
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function setJailActionUsed(userId, actionField) {
  const allowed = ["last_escape_at", "last_lawyer_at", "last_bribe_at"];
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

async function updateLastRobberyAt(userId) {
  await pool.query(
    `UPDATE users SET last_robbery_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

async function getRobberyCooldown(userId) {
  const result = await pool.query(
    `SELECT last_robbery_at FROM users WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row || !row.last_robbery_at) return 0;

  const nextTime = new Date(new Date(row.last_robbery_at).getTime() + ROBBERY_COOLDOWN_MS);
  const diff = nextTime.getTime() - Date.now();

  return diff > 0 ? diff : 0;
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

    if (!thiefRow.rows[0] || !victimRow.rows[0]) {
      throw new Error("USER_NOT_FOUND");
    }

    const victimBalance = Number(victimRow.rows[0].balance || 0);
    const actualAmount = Math.min(victimBalance, requestedAmount);

    if (actualAmount <= 0) {
      throw new Error("VICTIM_NO_MONEY");
    }

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
// GAME
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
  const result = await pool.query(
    `SELECT balance, last_basketball_at FROM users WHERE user_id = $1`,
    [userId]
  );

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

async function runKnb(userId, playerChoice) {
  const result = await pool.query(
    `SELECT balance, last_knb_at FROM users WHERE user_id = $1`,
    [userId]
  );

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

async function adjustUserCooldown(userId, cooldownName, deltaMs) {
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

    if (diff <= 0) return "✅ Уже доступно";
    return `⏳ ${formatRemainingTime(diff)}`;
  }

  return `⏱ Кулдауны

💰 Деньги: ${getRemaining(stats.last_daily_at, MONEY_COOLDOWN_MS)}
🏹 Охота: ${getRemaining(stats.last_hunt_at, HUNT_COOLDOWN_MS)}
🎯 Снайпер: ${getRemaining(stats.last_sniper_at, SNIPER_COOLDOWN_MS)}
🕵️ Ограбление: ${getRemaining(stats.last_robbery_at, ROBBERY_COOLDOWN_MS)}
🏦 Ограбление банка: ${getRemaining(stats.last_bank_at, BANK_HEIST_COOLDOWN_MS)}
🏀 Баскетбол: ${getRemaining(stats.last_basketball_at, BASKETBALL_COOLDOWN_MS)}
✂️ КНБ: ${getRemaining(stats.last_knb_at, KNB_COOLDOWN_MS)}`;
}

// =========================
// PROFILE
// =========================
async function getProfileText(user) {
  await initUser(user);
  const stats = await getUserStats(user.id);
  const shield = await getShieldRow(user.id);

  return `👤 Профиль пользователя

Имя: ${getUserLink(user)}
ID: ${user.id}

💰 Монеты: ${stats.balance || 0}
🤝 Респект: ${stats.respect || 0}
🛡 Щиты: ${Number(shield?.count || 0)}/${MAX_SHIELDS}

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
// EXTRA FAMILY HELPERS
// =========================
async function getFamilyRoleInfo(userId) {
  const marriage = await getMarriagePartner(userId);
  const childInfo = await getActiveAdoptionByChildId(userId);

  return {
    isMarried: !!marriage,
    marriage,
    isChild: !!childInfo,
    childInfo
  };
}

async function getFamilyTargetCheck(actorUserId, targetUserId) {
  const actorRole = await getFamilyRoleInfo(actorUserId);
  const targetRole = await getFamilyRoleInfo(targetUserId);

  const isMyChild = await isChildInMyFamily(actorUserId, targetUserId);
  const isMySpouse = await isSpouse(actorUserId, targetUserId);

  return {
    actorRole,
    targetRole,
    isMyChild,
    isMySpouse
  };
}

async function requireReplyTarget(msg, exampleText) {
  const target = await resolveTargetUserFromReply(msg);

  if (!target) {
    await safeSendMessage(
      msg.chat.id,
      `❌ Ответь на сообщение игрока и напиши: ${exampleText}`
    );
    return null;
  }

  await initUser(target);
  await saveSeenUser(msg.chat.id, target);

  return target;
}

async function requireMyChild(msg, exampleText) {
  const target = await requireReplyTarget(msg, exampleText);
  if (!target) return null;

  if (Number(target.id) === Number(msg.from.id)) {
    await safeSendMessage(msg.chat.id, "❌ Нельзя использовать эту команду на себе.");
    return null;
  }

  const check = await getFamilyTargetCheck(msg.from.id, target.id);

  if (check.isMyChild) return target;

  if (!check.actorRole.isMarried && !check.actorRole.isChild) {
    await safeSendMessage(
      msg.chat.id,
      "❌ У тебя нет семьи. Эта команда работает только для своего ребёнка."
    );
    return null;
  }

  if (check.targetRole.isChild && !check.isMyChild) {
    await safeSendMessage(
      msg.chat.id,
      `❌ ${getUserLink(target)} — ребёнок из другой семьи.\nОтветь на сообщение своего ребёнка.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
    return null;
  }

  await safeSendMessage(
    msg.chat.id,
    `❌ ${getUserLink(target)} не является твоим ребёнком.\nОтветь на сообщение своего ребёнка и напиши: ${escapeHtml(exampleText)}`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  return null;
}

async function requireMySpouse(msg, exampleText) {
  const target = await requireReplyTarget(msg, exampleText);
  if (!target) return null;

  if (Number(target.id) === Number(msg.from.id)) {
    await safeSendMessage(msg.chat.id, "❌ Нельзя использовать эту команду на себе.");
    return null;
  }

  const check = await getFamilyTargetCheck(msg.from.id, target.id);

  if (check.isMySpouse) return target;

  if (!check.actorRole.isMarried) {
    await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в браке.");
    return null;
  }

  await safeSendMessage(
    msg.chat.id,
    `❌ ${getUserLink(target)} не является твоим супругом(ой).\nОтветь на сообщение своего супруга(и) и напиши: ${escapeHtml(exampleText)}`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
  );

  return null;
}

async function requireChildWithDreamFromReply(msg, exampleText) {
  const target = await requireMyChild(msg, exampleText);
  if (!target) return null;

  const dream = await getChildDream(target.id);
  if (!dream) {
    await safeSendMessage(
      msg.chat.id,
      `❌ У ${getUserLink(target)} нет мечты.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
    return null;
  }

  return { target, dream };
}

async function requireNotJailed(msg) {
  const jailText = await getJailBlockText(msg.from.id);
  if (jailText) {
    await safeSendMessage(msg.chat.id, jailText);
    return false;
  }
  return true;
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
// FAMILY BUDGET
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
      `
      UPDATE users
      SET balance = balance + $2
      WHERE user_id = $1
      RETURNING balance
      `,
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

// =========================
// PIGGY BANK
// =========================
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

// =========================
// DREAMS
// =========================
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

  const isChild = await isChildInMyFamily(parentUserId, childUserId);
  if (!isChild) throw new Error("NOT_MY_CHILD");

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
    `🔥 <b>Мини Модератор — чат бот для Telegram групп</b>

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
• ограбить
• баскетбол
• кнб камень
• кнб ножницы
• кнб бумага
• купить монеты
• купить монеты другу
• купить щит
• мой щит
• /balance
• /cooldowns

<b>🏦 Ограбление банка</b>
• ограбление банка
• присоединиться к ограблению
• в дело
• купить маску
• статус ограбления
• начать штурм
• вскрыть сейф
• сбежать с банка
• отменить ограбление

<b>🚔 Тюрьма</b>
• тюрьма
• сбежать из тюрьмы
• адвокат
• подкупить охрану
• отсидеть

<b>👤 Профиль</b>
• /profile
• /profile ответом
• респект

<b>🎭 RP команды</b>
• убить
• обнять
• поцеловать
• ударить
• укусить
• погладить
• пнуть
• шлепнуть
• врезать
• лизнуть
• украсть
• заскамить
• уничтожить
• разбудить
• заморозить
• спасти
• подарок

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
• он врет?
• врет?

<b>ℹ️ Подсказка</b>
Многие команды работают <b>ответом на сообщение</b> игрока.`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    }
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

bot.onText(/^\/givemoney(@[A-Za-z0-9_]+)?(?:\s+(\d+))?$/, async (msg, match) => {
  try {
    if (Number(msg.from.id) !== OWNER_ID) return;

    const target = await resolveTargetUserFromReply(msg);
    const amount = Number(match?.[2] || 0);

    if (!target) {
      await safeSendMessage(msg.chat.id, "❌ Ответь на сообщение игрока и напиши: /givemoney 1000");
      return;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму.\nПример: /givemoney 1000");
      return;
    }

    await initUser(target);
    await saveSeenUser(msg.chat.id, target);

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

bot.onText(/^\/timeedit(@[A-Za-z0-9_]+)?\s+([^\s]+)\s+([+-]?\d+)(?:\s+([^\s]+))?$/, async (msg, match) => {
  try {
    if (Number(msg.from.id) !== OWNER_ID) return;

    const cooldownName = String(match?.[2] || "").trim();
    const rawValue = String(match?.[3] || "").trim();
    const rawUnit = String(match?.[4] || "").trim();

    const deltaMs = parseTimeEditAmount(rawValue, rawUnit);
    if (deltaMs === null) {
      await safeSendMessage(
        msg.chat.id,
        "❌ Примеры:\n/timeedit деньги -4\n/timeedit охота -2 часа\n/timeedit снайпер -30 минут\n/timeedit ограбление -15 мин\n/timeedit ограбление банка -2 часа"
      );
      return;
    }

    const deltaMinutes = Math.abs(Math.trunc(deltaMs / 60000));
    if (deltaMinutes > TIME_EDIT_MAX_MINUTES) {
      await safeSendMessage(
        msg.chat.id,
        `❌ Можно менять максимум на ${TIME_EDIT_MAX_MINUTES} минут за раз.`
      );
      return;
    }

    let targetUser = null;

    if (msg.reply_to_message) {
      targetUser = await resolveTargetUserFromReply(msg);
    }

    if (!targetUser) {
      targetUser = msg.from;
    }

    await initUser(targetUser);
    await saveSeenUser(msg.chat.id, targetUser);

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
      await safeSendMessage(msg.chat.id, "❌ Доступно только: деньги, охота, снайпер, ограбление, ограбление банка, баскетбол, кнб");
      return;
    }

    if (error.message === "COOLDOWN_NOT_USED_YET") {
      await safeSendMessage(
        msg.chat.id,
        "❌ У игрока этот кулдаун ещё не запускался. Сначала он должен использовать команду хотя бы 1 раз."
      );
      return;
    }

    console.error("Ошибка /timeedit:", error);
    await safeSendMessage(msg.chat.id, "❌ Ошибка изменения времени кулдауна.");
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

// =========================
// CALLBACKS
// =========================
bot.on("callback_query", async (query) => {
  try {
    if (!query.data || !query.message || !query.from) return;

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = String(query.data);

    if (data.startsWith("buy_self_")) {
      await safeAnswerCallback(query);
      await initUser(query.from);
      await saveSeenUser(chatId, query.from);

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
      await saveSeenUser(chatId, query.from);

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

    // =========================
    // RELATIONSHIP COMMANDS
    // =========================
    if (isExactCommand(lowerText, "ревновать")) {
      const target = await requireMySpouse(msg, "ревновать");
      if (!target) return;

      const added = Math.floor(Math.random() * 11) + 5;
      const state = await changeCoupleJealousy(msg.from.id, target.id, added);

      let mood = "😶 Всё пока спокойно.";
      if (Number(state.jealousy) >= 70) mood = "🔥 В семье уже сильная ревность.";
      else if (Number(state.jealousy) >= 40) mood = "😬 Напряжение в семье растёт.";

      await safeSendMessage(
        msg.chat.id,
        `💚 ${getUserLink(msg.from)} приревновал(а) ${getUserLink(target)}.

📈 Ревность семьи: ${Number(state.jealousy || 0)}/100
${mood}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
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
      const target = await requireMySpouse(msg, "помириться");
      if (!target) return;

      const reduced = Math.floor(Math.random() * 16) + 10;
      const state = await changeCoupleJealousy(msg.from.id, target.id, -reduced);

      await safeSendMessage(
        msg.chat.id,
        `🕊 ${getUserLink(msg.from)} помирился(ась) с ${getUserLink(target)}.

📉 Ревность семьи: ${Number(state.jealousy || 0)}/100`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // SHIELD COMMANDS
    // =========================
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

        await safeSendMessage(
          msg.chat.id,
          `🛡 ${getUserLink(msg.from)} купил(а) щит.

💸 Цена щита: ${SHIELD_COST} монет
🛡 Щитов сейчас: ${result.shieldCount}/${MAX_SHIELDS}
👛 Твой баланс: ${result.userBalance}

💡 Один щит блокирует одно успешное ограбление.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(
            msg.chat.id,
            `❌ Щит стоит ${SHIELD_COST} монет.
У тебя недостаточно монет.`
          );
          return;
        }

        if (error.message === "MAX_SHIELDS_REACHED") {
          await safeSendMessage(
            msg.chat.id,
            `❌ У тебя уже максимум щитов: ${MAX_SHIELDS}/${MAX_SHIELDS}`
          );
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

    // =========================
    // PUNISHMENT COMMANDS
    // =========================
    if (lowerText.startsWith("наказать ребенка")) {
      const parent = msg.from;
      const child = await requireMyChild(msg, "наказать ребенка 1");
      if (!child) return;

      const match = lowerText.match(/^наказать ребенка\s+(\d+)$/);
      const days = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(days) || days < 1 || days > MAX_PUNISHMENT_DAYS) {
        await safeSendMessage(
          msg.chat.id,
          `❌ Укажи от 1 до ${MAX_PUNISHMENT_DAYS} дней.\nПример: наказать ребенка 3`
        );
        return;
      }

      const punishment = await setPunishment(parent.id, child.id, days);
      await changeChildObedience(child.id, -10);

      await safeSendMessage(
        msg.chat.id,
        `⛔ ${getUserLink(parent)} наказал(а) ${getUserLink(child)} на ${days} дн.

📌 Ограничения:
• нельзя просить деньги
• нельзя получать карманные деньги
• нельзя брать из семейного бюджета

🕒 До: ${formatDateTime(punishment.until_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "снять наказание")) {
      const parent = msg.from;
      const child = await requireMyChild(msg, "снять наказание");
      if (!child) return;

      const removed = await removePunishment(child.id);
      if (!removed) {
        await safeSendMessage(msg.chat.id, "✅ У этого ребёнка и так нет активного наказания.");
        return;
      }

      await changeChildObedience(child.id, 5);

      await safeSendMessage(
        msg.chat.id,
        `✅ ${getUserLink(parent)} снял(а) наказание с ${getUserLink(child)}.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
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

    // =========================
    // GOOD DEEDS / OBEDIENCE
    // =========================
    if (isExactCommand(lowerText, "похвалить ребенка")) {
      const parent = msg.from;
      const child = await requireMyChild(msg, "похвалить ребенка");
      if (!child) return;

      const obedience = await changeChildObedience(child.id, 5);

      await safeSendMessage(
        msg.chat.id,
        `🌟 ${getUserLink(parent)} похвалил(а) ${getUserLink(child)}!

📈 Послушание: ${Number(obedience.value || 0)}/100`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (lowerText.startsWith("наградить ребенка")) {
      const parent = msg.from;
      const child = await requireMyChild(msg, "наградить ребенка 20");
      if (!child) return;

      const match = lowerText.match(/^наградить ребенка\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: наградить ребенка 20"
        );
        return;
      }

      try {
        const transferResult = await transferCoins(parent.id, child.id, amount);
        const obedience = await changeChildObedience(child.id, 3);

        await safeSendMessage(
          msg.chat.id,
          `🎁 ${getUserLink(parent)} наградил(а) ${getUserLink(child)} на ${amount} монет!

👛 Баланс ${escapeHtml(getUserName(parent))}: ${transferResult.fromBalance}
👛 Баланс ${escapeHtml(getUserName(child))}: ${transferResult.toBalance}
📈 Послушание: ${Number(obedience.value || 0)}/100`,
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

        console.error("Ошибка награды ребёнку:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка награждения ребёнка.");
      }

      return;
    }

    if (lowerText.startsWith("добавить доброе дело")) {
      const parent = msg.from;
      const child = await requireMyChild(msg, "добавить доброе дело помог по дому");
      if (!child) return;

      const deedText = text.slice("добавить доброе дело".length).trim();
      if (!deedText || deedText.length < 2) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Напиши так:\nдобавить доброе дело помог по дому"
        );
        return;
      }

      if (deedText.length > MAX_GOOD_DEED_LENGTH) {
        await safeSendMessage(
          msg.chat.id,
          `❌ Доброе дело слишком длинное. Максимум ${MAX_GOOD_DEED_LENGTH} символов.`
        );
        return;
      }

      await addGoodDeed(parent.id, child.id, deedText);
      const obedience = await changeChildObedience(child.id, 3);

      await safeSendMessage(
        msg.chat.id,
        `✅ ${getUserLink(parent)} добавил(а) доброе дело для ${getUserLink(child)}

📔 Дело: ${escapeHtml(deedText)}
📈 Послушание: ${Number(obedience.value || 0)}/100`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
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
        await safeSendMessage(
          msg.chat.id,
          `📔 У ${escapeHtml(getUserName(targetUser))} пока нет добрых дел.`,
          { parse_mode: "HTML" }
        );
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
      const child = await requireMyChild(msg, "удалить доброе дело 1");
      if (!child) return;

      const match = lowerText.match(/^удалить доброе дело\s+(\d+)$/);
      const index = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(index) || index <= 0) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи номер.\nПример: удалить доброе дело 1"
        );
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
      const child = await requireMyChild(msg, "очистить добрые дела");
      if (!child) return;

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

    // =========================
    // JAIL
    // =========================
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
• сбежать из тюрьмы
• адвокат
• подкупить охрану
• отсидеть`,
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

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_escape_at, JAIL_ESCAPE_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Снова попробовать сбежать можно через ${formatRemainingTime(remainingCd)}`
        );
        return;
      }

      await setJailActionUsed(msg.from.id, "last_escape_at");

      const outcome = getRandomEscapeOutcome();

      if (outcome.type === "success") {
        await removeUserFromJail(msg.from.id);
        await safeSendMessage(
          msg.chat.id,
          `🏃 ${getUserLink(msg.from)} совершил(а) побег из тюрьмы!

🔓 Ему удалось скрыться.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "fail") {
        await safeSendMessage(
          msg.chat.id,
          `🚫 Побег не удался.

👮 Охрана заметила попытку, но срок не изменился.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const updatedJail = await extendJailTime(msg.from.id, outcome.extraMs);
      await safeSendMessage(
        msg.chat.id,
        `⛓ ${getUserLink(msg.from)} попытался(ась) сбежать, но был(а) пойман(а).

➕ Срок увеличен на 30 минут.
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
        await safeSendMessage(
          msg.chat.id,
          `⏳ Снова вызвать адвоката можно через ${formatRemainingTime(remainingCd)}`
        );
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if (Number(stats?.balance || 0) < JAIL_LAWYER_COST) {
        await safeSendMessage(
          msg.chat.id,
          `❌ Для адвоката нужно ${JAIL_LAWYER_COST} монет.`
        );
        return;
      }

      await deductCoinsSafe(msg.from.id, JAIL_LAWYER_COST);
      await setJailActionUsed(msg.from.id, "last_lawyer_at");

      const outcome = getRandomLawyerOutcome();

      if (outcome.type === "free") {
        await removeUserFromJail(msg.from.id);
        await safeSendMessage(
          msg.chat.id,
          `⚖️ ${getUserLink(msg.from)} нанял(а) адвоката за ${JAIL_LAWYER_COST} монет.

✅ Адвокат добился освобождения!`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "reduce") {
        const updatedJail = await reduceJailTime(msg.from.id, outcome.reduceMs);
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

      const row = await getJailActionRow(msg.from.id);
      const remainingCd = getActionRemaining(row?.last_bribe_at, JAIL_BRIBE_COOLDOWN_MS);
      if (remainingCd > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Снова пробовать подкуп можно через ${formatRemainingTime(remainingCd)}`
        );
        return;
      }

      const stats = await getUserStats(msg.from.id);
      if (Number(stats?.balance || 0) < JAIL_BRIBE_COST) {
        await safeSendMessage(
          msg.chat.id,
          `❌ Для подкупа охраны нужно ${JAIL_BRIBE_COST} монет.`
        );
        return;
      }

      await deductCoinsSafe(msg.from.id, JAIL_BRIBE_COST);
      await setJailActionUsed(msg.from.id, "last_bribe_at");

      const outcome = getRandomBribeOutcome();

      if (outcome.type === "free") {
        await removeUserFromJail(msg.from.id);
        await safeSendMessage(
          msg.chat.id,
          `💸 ${getUserLink(msg.from)} подкупил(а) охрану за ${JAIL_BRIBE_COST} монет.

🔓 Его тихо выпустили из тюрьмы.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (outcome.type === "fail") {
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
      await safeSendMessage(
        msg.chat.id,
        `🚨 Попытка подкупа раскрыта.

⛓ Срок увеличен на 45 минут.
🕒 Новый срок до: ${formatDateTime(updatedJail.until_at)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    // =========================
    // FAMILY BUDGET
    // =========================
    if (isExactCommand(lowerText, "семейный бюджет")) {
      const budget = await getFamilyBudget(msg.from.id);

      if (!budget) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Ты не состоишь в семье. Семейный бюджет доступен только семье."
        );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: вложить в бюджет 5"
        );
        return;
      }

      try {
        const result = await addToFamilyBudget(msg.from.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `🏦 ${getUserLink(msg.from)} вложил(а) в семейный бюджет ${amount} монет

💰 Бюджет семьи: ${result.familyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлён: ${formatDateTime(result.updatedAt)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_FAMILY") {
          await safeSendMessage(
            msg.chat.id,
            "❌ Ты не состоишь в семье. Пополнять семейный бюджет нельзя."
          );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: взять с бюджета 5"
        );
        return;
      }

      const childInfo = await getActiveAdoptionByChildId(msg.from.id);
      if (childInfo) {
        const punishmentText = await getPunishedBlockText(msg.from.id);
        if (punishmentText) {
          await safeSendMessage(
            msg.chat.id,
            `${punishmentText}\nВо время наказания нельзя брать деньги из семейного бюджета.`
          );
          return;
        }
      }

      try {
        const result = await takeFromFamilyBudget(msg.from.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `🏦 ${getUserLink(msg.from)} взял(а) из семейного бюджета ${amount} монет

💰 Бюджет семьи: ${result.familyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлён: ${formatDateTime(result.updatedAt)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_FAMILY") {
          await safeSendMessage(
            msg.chat.id,
            "❌ Ты не состоишь в семье. Брать деньги из семейного бюджета нельзя."
          );
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

    // =========================
    // PIGGY BANK
    // =========================
    if (isExactCommand(lowerText, "создать копилку")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Копилка доступна только ребёнку в семье.");
        return;
      }

      const existing = await getPiggyBank(msg.from.id);
      if (existing) {
        await safeSendMessage(
          msg.chat.id,
          `🐷 У тебя уже есть копилка.\n💰 В копилке: ${Number(existing.balance || 0)} монет`
        );
        return;
      }

      const piggy = await createPiggyBank(msg.from.id);

      await safeSendMessage(
        msg.chat.id,
        `🐷 ${getUserLink(msg.from)} создал(а) копилку!

💰 В копилке: ${Number(piggy.balance || 0)} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ У тебя нет копилки.\nНапиши: создать копилку"
        );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: пополнить копилку 5"
        );
        return;
      }

      try {
        const result = await addToPiggyBank(msg.from.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `🐷 ${getUserLink(msg.from)} положил(а) в копилку ${amount} монет

💰 В копилке: ${result.piggyBalance}
👛 Твой баланс: ${result.userBalance}
🕒 Обновлена: ${formatDateTime(result.updatedAt)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_PIGGY_BANK") {
          await safeSendMessage(
            msg.chat.id,
            "❌ У тебя нет копилки.\nНапиши: создать копилку"
          );
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

        await safeSendMessage(
          msg.chat.id,
          `💥 ${getUserLink(msg.from)} разбил(а) копилку и достал(а) ${result.taken} монет!

🐷 В копилке: ${result.piggyBalance}
👛 Твой баланс: ${result.userBalance}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_PIGGY_BANK") {
          await safeSendMessage(
            msg.chat.id,
            "❌ У тебя нет копилки.\nНапиши: создать копилку"
          );
          return;
        }

        console.error("Ошибка разбития копилки:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка при разбитии копилки.");
      }

      return;
    }

    // =========================
    // DREAMS
    // =========================
    if (lowerText.startsWith("загадать мечту")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ Мечта доступна только ребёнку в семье.");
        return;
      }

      const dreamText = text.slice("загадать мечту".length).trim();
      if (!dreamText || dreamText.length < 2) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Напиши так:\nзагадать мечту айфон"
        );
        return;
      }

      if (dreamText.length > 120) {
        await safeSendMessage(msg.chat.id, "❌ Мечта слишком длинная. Максимум 120 символов.");
        return;
      }

      const dream = await setChildDream(msg.from.id, dreamText);

      await safeSendMessage(
        msg.chat.id,
        `🌟 ${getUserLink(msg.from)} загадал(а) мечту!

🎯 Мечта: ${escapeHtml(dream.dream_text)}
💰 Баланс на мечту: ${Number(dream.dream_balance || 0)}`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ У тебя пока нет мечты.\nНапиши: загадать мечту айфон"
        );
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
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: пополнить баланс на мечту 5"
        );
        return;
      }

      try {
        const result = await addSelfMoneyToDream(msg.from.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `🌟 ${getUserLink(msg.from)} пополнил(а) баланс на мечту на ${amount} монет

🎯 Мечта: ${escapeHtml(result.dreamText)}
💰 Баланс мечты: ${result.dreamBalance}
👛 Твой баланс: ${result.userBalance}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_DREAM") {
          await safeSendMessage(
            msg.chat.id,
            "❌ У тебя нет мечты.\nНапиши: загадать мечту айфон"
          );
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
      const childData = await requireChildWithDreamFromReply(msg, "на мечту 5");
      if (!childData) return;

      const { target } = childData;

      const match = lowerText.match(/^на мечту\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: на мечту 5"
        );
        return;
      }

      try {
        const result = await addParentMoneyToDream(msg.from.id, target.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `🎁 ${getUserLink(msg.from)} пополнил(а) мечту ${getUserLink(target)} на ${amount} монет

🎯 Мечта: ${escapeHtml(result.dreamText)}
💰 Баланс мечты: ${result.dreamBalance}
👛 Твой баланс: ${result.parentBalance}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_DREAM") {
          await safeSendMessage(
            msg.chat.id,
            `❌ У ${getUserLink(target)} нет мечты.`,
            {
              parse_mode: "HTML",
              disable_web_page_preview: true
            }
          );
          return;
        }

        if (error.message === "NOT_MY_CHILD") {
          await safeSendMessage(
            msg.chat.id,
            `❌ ${getUserLink(target)} не является твоим ребёнком.\nОтветь на сообщение своего ребёнка.`,
            {
              parse_mode: "HTML",
              disable_web_page_preview: true
            }
          );
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

    // =========================
    // FAMILY MONEY
    // =========================
    if (lowerText.startsWith("попросить денег")) {
      const childInfo = await getActiveAdoptionByChildId(msg.from.id);

      if (!childInfo) {
        await safeSendMessage(msg.chat.id, "❌ У тебя нет родителей в семье.");
        return;
      }

      const punishmentText = await getPunishedBlockText(msg.from.id);
      if (punishmentText) {
        await safeSendMessage(
          msg.chat.id,
          `${punishmentText}\nВо время наказания нельзя просить деньги.`
        );
        return;
      }

      const match = lowerText.match(/^попросить денег\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: попросить денег 5"
        );
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
      if (!(await requireNotJailed(msg))) return;

      const target = await requireMyChild(msg, "дать ребенку 5");
      if (!target) return;

      const match = lowerText.match(/^дать ребенку\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Укажи нормальную сумму.\nПример: дать ребенку 5"
        );
        return;
      }

      const punishmentText = await getPunishedBlockText(target.id);
      if (punishmentText) {
        await safeSendMessage(
          msg.chat.id,
          `${punishmentText}\nВо время наказания карманные деньги выдавать нельзя.`
        );
        return;
      }

      try {
        const transferResult = await transferCoins(msg.from.id, target.id, amount);

        await safeSendMessage(
          msg.chat.id,
          `💸 ${getUserLink(msg.from)} дал(а) ${getUserLink(target)} ${amount} монет

Баланс ${escapeHtml(getUserName(msg.from))}: ${transferResult.fromBalance}
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

        console.error("Ошибка выдачи денег ребёнку:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка перевода монет ребёнку.");
      }

      return;
    }

    if (lowerText.startsWith("карманные деньги")) {
      if (!(await requireNotJailed(msg))) return;

      const sender = msg.from;
      const target = await requireMyChild(msg, "карманные деньги 50");
      if (!target) return;

      const match = lowerText.match(/^карманные деньги\s+(\d+)$/);
      const amount = match ? Number(match[1]) : NaN;

      if (!Number.isInteger(amount) || amount <= 0) {
        await safeSendMessage(msg.chat.id, "❌ Укажи нормальную сумму больше 0.\nПример: карманные деньги 50");
        return;
      }

      const punishmentText = await getPunishedBlockText(target.id);
      if (punishmentText) {
        await safeSendMessage(
          msg.chat.id,
          `${punishmentText}\nВо время наказания карманные деньги выдавать нельзя.`
        );
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

    // =========================
    // ROBBERY
    // =========================
    if (isExactCommand(lowerText, "ограбить")) {
      if (!(await requireNotJailed(msg))) return;

      const childPunishment = await getPunishedBlockText(msg.from.id);
      if (childPunishment) {
        await safeSendMessage(
          msg.chat.id,
          `${childPunishment}\nВо время наказания нельзя грабить других.`
        );
        return;
      }

      const target = await requireReplyTarget(msg, "ограбить");
      if (!target) return;

      if (Number(target.id) === Number(msg.from.id)) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя ограбить самого себя.");
        return;
      }

      const robberyCooldown = await getRobberyCooldown(msg.from.id);
      if (robberyCooldown > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Ограбление снова будет доступно через ${formatRemainingTime(robberyCooldown)}`
        );
        return;
      }

      await updateLastRobberyAt(msg.from.id);

      const targetShield = await getShieldRow(target.id);
      if (Number(targetShield?.count || 0) > 0) {
        const shieldUse = await useShieldOnce(target.id);

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
        return;
      }

      const targetStats = await getUserStats(target.id);
      if (!targetStats || Number(targetStats.balance || 0) <= 0) {
        await safeSendMessage(msg.chat.id, "❌ У этого игрока нет монет. Грабить нечего.");
        return;
      }

      const robbery = getRandomRobberyResult();

      if (robbery.type === "fail") {
        let resultText = `🚨 ${getUserLink(msg.from)} попытался ограбить ${getUserLink(target)}, но его спалили!`;

        const failFine = Math.floor(Math.random() * 4) + 2;
        try {
          const fineResult = await deductCoinsSafe(msg.from.id, failFine);
          if (fineResult.deducted > 0) {
            resultText += `\n💸 Штраф за провал: ${fineResult.deducted} монет`;
          }
        } catch (error) {
          console.error("Ошибка штрафа за провал ограбления:", error);
        }

        const police = getRandomPoliceOutcome();

        if (police.type === "fine") {
          try {
            const fine = await deductCoinsSafe(msg.from.id, police.amount);
            if (fine.deducted > 0) {
              resultText += `\n🚓 Полиция поймала преступника.\n💸 Полицейский штраф: ${fine.deducted} монет`;
            } else {
              resultText += `\n🚓 Полиция пришла, но денег на штраф уже не осталось.`;
            }
          } catch (error) {
            console.error("Ошибка police fine:", error);
          }
        }

        if (police.type === "jail") {
          const jail = await sendUserToJail(msg.from.id, POLICE_JAIL_MS);
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

      let resultText = robbery.type === "small"
        ? `🕵️ ${getUserLink(msg.from)} ограбил(а) ${getUserLink(target)} и украл(а) ${transfer.stolen} монет`
        : `💰 ${getUserLink(msg.from)} удачно ограбил(а) ${getUserLink(target)} и вынес(ла) ${transfer.stolen} монет!`;

      const police = getRandomPoliceOutcome();

      if (police.type === "fine") {
        try {
          const fine = await deductCoinsSafe(msg.from.id, police.amount);
          if (fine.deducted > 0) {
            resultText += `\n🚓 Но полиция вычислила вора.`;
            resultText += `\n💸 Штраф: ${fine.deducted} монет`;
          } else {
            resultText += `\n🚓 Полиция пришла, но денег на штраф уже не осталось.`;
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
        resultText += `\n🚔 Полиция задержала ${getUserLink(msg.from)}!`;
        resultText += `\n🕒 До: ${formatDateTime(jail.until_at)}`;
      }

      await safeSendMessage(msg.chat.id, resultText, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      return;
    }

    // =========================
    // MONEY GAMES
    // =========================
    if (isExactCommand(lowerText, "деньги") || isExactCommand(lowerText, "монеты")) {
      if (!(await requireNotJailed(msg))) return;

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
      if (!(await requireNotJailed(msg))) return;

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
      if (!(await requireNotJailed(msg))) return;

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

    if (isExactCommand(lowerText, "баскетбол")) {
      if (!(await requireNotJailed(msg))) return;

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

      await safeSendMessage(
        msg.chat.id,
        `🏀 ${getUserLink(msg.from)} бросил(а) мяч в кольцо

${escapeHtml(result.game.text)}
${coinsLine}

Баланс: ${result.balance} монет`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (
      lowerText === "кнб камень" ||
      lowerText === "кнб ножницы" ||
      lowerText === "кнб бумага"
    ) {
      if (!(await requireNotJailed(msg))) return;

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

      await safeSendMessage(
        msg.chat.id,
        `✂️ КНБ

👤 Ты: ${escapeHtml(playerChoice)}
🤖 Бот: ${escapeHtml(result.botChoice)}

${escapeHtml(result.game.text)}
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
    // BANK HEIST COMMANDS
    // =========================
    if (isExactCommand(lowerText, "ограбление банка")) {
      if (!(await requireNotJailed(msg))) return;

      const existingHeist = getBankHeist(msg.chat.id);
      if (existingHeist) {
        await safeSendMessage(
          msg.chat.id,
          `❌ В этом чате уже есть активное ограбление банка.\n\n${getHeistStatusText(existingHeist)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      const cooldown = await getBankHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Ограбление банка снова будет доступно через ${formatRemainingTime(cooldown)}`
        );
        return;
      }

      const heist = createBankHeist(msg.chat.id, msg.from);

      await safeSendMessage(
        msg.chat.id,
        `🏦 ${getUserLink(msg.from)} начал(а) подготовку к ограблению банка!

👑 Лидер: ${getUserLink(msg.from)}
👥 Сейчас в команде: 1/${BANK_HEIST_MAX_MEMBERS}
🎯 Нужно минимум ${BANK_HEIST_MIN_MEMBERS} игрока

Что делать дальше:
• присоединиться к ограблению
• в дело
• купить маску
• статус ограбления
• начать штурм

💡 Маска стоит ${BANK_MASK_COST} монет и повышает шансы команды.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "присоединиться к ограблению") || isExactCommand(lowerText, "в дело")) {
      if (!(await requireNotJailed(msg))) return;

      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ В этом чате нет активного ограбления банка.");
        return;
      }

      const cooldown = await getBankHeistCooldown(msg.from.id);
      if (cooldown > 0) {
        await safeSendMessage(
          msg.chat.id,
          `⏳ Ты ещё не можешь участвовать в новом ограблении банка.\nОсталось: ${formatRemainingTime(cooldown)}`
        );
        return;
      }

      const result = await addUserToBankHeist(msg.chat.id, msg.from);

      if (!result.ok) {
        if (result.reason === "already_started") {
          await safeSendMessage(msg.chat.id, "❌ Ограбление уже началось. Присоединиться поздно.");
          return;
        }

        if (result.reason === "already_member") {
          await safeSendMessage(msg.chat.id, "✅ Ты уже в команде.");
          return;
        }

        if (result.reason === "team_full") {
          await safeSendMessage(msg.chat.id, `❌ Команда уже полная. Максимум ${BANK_HEIST_MAX_MEMBERS} игроков.`);
          return;
        }

        await safeSendMessage(msg.chat.id, "❌ Ошибка присоединения к ограблению.");
        return;
      }

      await safeSendMessage(
        msg.chat.id,
        `👥 ${getUserLink(msg.from)} присоединился(ась) к ограблению банка!

Команда: ${getHeistMemberCount(heist)}/${BANK_HEIST_MAX_MEMBERS}
Лидер: ${getUserLink(heist.members[String(heist.leaderId)])}

Теперь можно:
• купить маску
• статус ограбления
• начать штурм`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true
        }
      );
      return;
    }

    if (isExactCommand(lowerText, "купить маску")) {
      const heist = getBankHeist(msg.chat.id);
      if (!heist) {
        await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
        return;
      }

      try {
        const result = await buyMaskForHeistMember(msg.chat.id, msg.from.id);

        await safeSendMessage(
          msg.chat.id,
          `🎭 ${getUserLink(msg.from)} купил(а) маску для ограбления.

💸 Цена: ${BANK_MASK_COST} монет
👛 Баланс: ${result.userBalance}
🎭 Масок в команде: ${getMaskedMembersCount(result.heist)}/${getHeistMemberCount(result.heist)}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
      } catch (error) {
        if (error.message === "NO_HEIST") {
          await safeSendMessage(msg.chat.id, "❌ Сейчас нет активного ограбления банка.");
          return;
        }

        if (error.message === "WRONG_STAGE") {
          await safeSendMessage(msg.chat.id, "❌ Уже поздно покупать маску. Ограбление уже началось.");
          return;
        }

        if (error.message === "NOT_MEMBER") {
          await safeSendMessage(msg.chat.id, "❌ Ты не состоишь в команде ограбления.");
          return;
        }

        if (error.message === "ALREADY_HAVE_MASK") {
          await safeSendMessage(msg.chat.id, "✅ У тебя уже есть маска.");
          return;
        }

        if (error.message === "NOT_ENOUGH_MONEY") {
          await safeSendMessage(msg.chat.id, `❌ Маска стоит ${BANK_MASK_COST} монет. У тебя не хватает денег.`);
          return;
        }

        console.error("Ошибка покупки маски:", error);
        await safeSendMessage(msg.chat.id, "❌ Ошибка покупки маски.");
      }
      return;
    }

    if (isExactCommand(lowerText, "статус ограбления")) {
      const heist = getBankHeist(msg.chat.id);
      await safeSendMessage(msg.chat.id, getHeistStatusText(heist), {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
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
      if (!(await requireNotJailed(msg))) return;

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
        await safeSendMessage(
          msg.chat.id,
          `❌ Для ограбления банка нужно минимум ${BANK_HEIST_MIN_MEMBERS} игрока.`
        );
        return;
      }

      for (const user of members) {
        const jail = await getJailStatus(user.id);
        if (jail) {
          await safeSendMessage(
            msg.chat.id,
            `❌ ${getUserLink(user)} сейчас в тюрьме. Команда не может начать штурм.`,
            {
              parse_mode: "HTML",
              disable_web_page_preview: true
            }
          );
          return;
        }
      }

      heist.startedAt = Date.now();

      const entry = getBankEntryOutcome(heist);

      if (entry.type === "clean_success") {
        heist.stage = "inside";
        heist.policeAlert = false;

        await safeSendMessage(
          msg.chat.id,
          `🏦 Команда ворвалась в банк без лишнего шума!

👥 Участников: ${getHeistMemberCount(heist)}
🎭 Масок: ${getMaskedMembersCount(heist)}
😶 Полиция пока ничего не знает.

Следующая команда:
• вскрыть сейф`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (entry.type === "noisy_success") {
        heist.stage = "inside";
        heist.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `🚨 Команда ворвалась в банк, но подняла шум!

🏦 Внутрь попасть удалось.
🚔 Полиция уже получила сигнал.

Следующая команда:
• вскрыть сейф`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (entry.type === "partial_fail_alarm") {
        heist.stage = "inside";
        heist.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `⚠️ На входе всё пошло криво, но команда всё же прорвалась внутрь.

🚨 Сработала тревога.
🚔 Полиция уже в пути.

Следующая команда:
• вскрыть сейф`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await punishHeistMembersWithPolice(
        msg.chat.id,
        heist,
        "total_fail_before_entry",
        "Охрана заметила подготовку и нажала тревожную кнопку."
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

      const vault = getVaultOutcome(heist);

      if (vault.type === "jackpot") {
        heist.loot = vault.loot;
        heist.stage = "escape";

        if (Math.random() < 0.65) {
          heist.policeAlert = true;
        }

        await safeSendMessage(
          msg.chat.id,
          `💰 Сейф вскрыт идеально!

🗄 Команда забрала ${vault.loot} монет
🚔 Полиция: ${heist.policeAlert ? "уже рядом" : "пока не настигла"}

Следующая команда:
• сбежать с банка`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (vault.type === "success") {
        heist.loot = vault.loot;
        heist.stage = "escape";

        if (Math.random() < 0.50) {
          heist.policeAlert = true;
        }

        await safeSendMessage(
          msg.chat.id,
          `🗄 Сейф вскрыт!

💰 Добыча: ${vault.loot} монет
🚔 Полиция: ${heist.policeAlert ? "уже на подходе" : "ещё не догнала"}

Следующая команда:
• сбежать с банка`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      if (vault.type === "small") {
        heist.loot = vault.loot;
        heist.stage = "escape";
        heist.policeAlert = true;

        await safeSendMessage(
          msg.chat.id,
          `⚠️ Сейф удалось открыть только частично.

💰 Взято: ${vault.loot} монет
🚨 Поднята тревога, полиция уже мчится!

Следующая команда:
• сбежать с банка`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
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

      await punishHeistMembersWithPolice(
        msg.chat.id,
        heist,
        "vault_disaster",
        "При попытке вскрытия сейфа сработала защита."
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
        await safeSendMessage(msg.chat.id, "❌ Сейчас рано бежать. Сначала нужно дойти до этого этапа.");
        return;
      }

      const outcome = getEscapeOutcome(heist);
      const members = getHeistMembersList(heist);

      if (outcome.type === "full_escape") {
        await rewardHeistMembers(msg.chat.id, heist, heist.loot, {
          title: "🏃 Побег удался!",
          subtitle: `Команда смогла унести всю добычу: ${heist.loot} монет`
        });
        return;
      }

      if (outcome.type === "half_escape") {
        const savedLoot = Math.max(1, Math.floor(heist.loot * 0.55));
        await rewardHeistMembers(msg.chat.id, heist, savedLoot, {
          title: "🏃 Побег частично удался",
          subtitle: `Во время побега пришлось бросить часть мешков.\nСохранено: ${savedLoot} из ${heist.loot} монет`
        });
        return;
      }

      if (outcome.type === "one_caught") {
        const shuffled = [...members].sort(() => Math.random() - 0.5);
        const caught = shuffled[0];
        const escaped = shuffled.slice(1);

        await sendUserToJail(caught.id, POLICE_JAIL_MS);
        await updateBankHeistCooldownForUsers(members.map((m) => m.id));

        const savedLoot = Math.max(1, Math.floor(heist.loot * 0.70));
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
            lines.push(`• ${getUserLink(user)} — +${amount} монет (баланс: ${newBalance})`);
          }

          shareText = lines.join("\n");
        }

        clearBankHeist(msg.chat.id);

        await safeSendMessage(
          msg.chat.id,
          `🚔 Побег удался не всем.

⛓ Пойман(а): ${getUserLink(caught)}
💰 Остальным удалось унести ${savedLoot} монет

${shareText ? `Раздел добычи:\n${shareText}` : "Никто больше не ушёл с добычей."}`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true
          }
        );
        return;
      }

      await punishHeistMembersWithPolice(
        msg.chat.id,
        heist,
        "all_caught_escape",
        "На выезде команду уже ждала полиция."
      );
      return;
    }

    // =========================
    // SHOP
    // =========================
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
      const target = await requireReplyTarget(msg, "купить монеты другу");
      if (!target) return;

      if (Number(target.id) === Number(msg.from.id)) {
        await safeSendMessage(
          msg.chat.id,
          "❌ Себе через эту команду покупать нельзя.\nИспользуй: купить монеты"
        );
        return;
      }

      await initUser(target);
      await saveSeenUser(msg.chat.id, target);

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

    // =========================
    // OTHER
    // =========================
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

    if (isExactCommand(lowerText, "брак") || isExactCommand(lowerText, "зарегистрироваться в брак")) {
      const sender = msg.from;
      const target = await requireReplyTarget(msg, "брак");
      if (!target) return;

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

      const isTargetMyChild = await isChildInMyFamily(sender.id, target.id);
      if (isTargetMyChild) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя вступить в брак со своим ребёнком.");
        return;
      }

      const amIChildOfTarget = await isChildInMyFamily(target.id, sender.id);
      if (amIChildOfTarget) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя вступить в брак со своим родителем.");
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
      if (partnerUser) {
        await deleteCoupleStateByUsers(msg.from.id, partnerUser.id);
      }

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
      const child = await requireReplyTarget(msg, "усыновить");
      if (!child) return;

      if (Number(parent.id) === Number(child.id)) {
        await safeSendMessage(msg.chat.id, "❌ Нельзя усыновить самого себя.");
        return;
      }

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
      const child = await requireMyChild(msg, "отказаться от ребенка");
      if (!child) return;

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
      const child = await requireMyChild(msg, "любимый ребенок");
      if (!child) return;

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
        if (resolved) {
          await initUser(resolved);
          await saveSeenUser(msg.chat.id, resolved);
          targetUser = resolved;
        }
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

    if (
      isExactCommand(lowerText, "он врет?") ||
      isExactCommand(lowerText, "врет?") ||
      isExactCommand(lowerText, "он врёт?") ||
      isExactCommand(lowerText, "врёт?")
    ) {
      const target = await requireReplyTarget(msg, "он врет?");
      if (!target) return;

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
      const target = await requireReplyTarget(msg, "респект");
      if (!target) return;

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
      const target = await requireReplyTarget(msg, "подарок");
      if (!target) return;

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
      const target = await requireReplyTarget(msg, lowerText);
      if (!target) return;

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
    const target = await requireReplyTarget(msg, lowerText);
    if (!target) return;

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
    await clampAllShieldsToMax();
    await cleanupExpiredPunishments();
    await cleanupExpiredJail();

    console.log("✅ Shields clamped to max =", MAX_SHIELDS);
    console.log("✅ Bot started");
  } catch (error) {
    console.error("❌ Ошибка запуска:", error);
  }
})();
