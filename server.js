const express = require("express");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN не найден в переменных окружения");
}

const bot = new TelegramBot(token, { polling: true });

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
const DB_PATH = path.join(__dirname, "db.json");

let db = {
  users: {},
  profileMessages: {}
};

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      const parsed = JSON.parse(raw);

      db.users = parsed.users || {};
      db.profileMessages = parsed.profileMessages || {};
    }
  } catch (error) {
    console.error("Ошибка чтения db.json:", error);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    console.error("Ошибка сохранения db.json:", error);
  }
}

loadDb();

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

function initUser(user) {
  if (!user || !user.id) return;

  const id = String(user.id);

  if (!db.users[id]) {
    db.users[id] = {
      id: user.id,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      username: user.username || "",
      kills: 0,
      hugs: 0,
      kisses: 0,
      hits: 0,
      bites: 0,
      pats: 0,
      kicks: 0,
      slaps: 0,
      punches: 0,
      total: 0
    };
  } else {
    db.users[id].first_name = user.first_name || db.users[id].first_name || "";
    db.users[id].last_name = user.last_name || db.users[id].last_name || "";
    db.users[id].username = user.username || db.users[id].username || "";
  }
}

function getStats(userId) {
  const id = String(userId);

  if (!db.users[id]) {
    db.users[id] = {
      id: Number(userId),
      first_name: "",
      last_name: "",
      username: "",
      kills: 0,
      hugs: 0,
      kisses: 0,
      hits: 0,
      bites: 0,
      pats: 0,
      kicks: 0,
      slaps: 0,
      punches: 0,
      total: 0
    };
  }

  return db.users[id];
}

function getStoredUser(userId) {
  const stats = getStats(userId);

  return {
    id: stats.id,
    first_name: stats.first_name,
    last_name: stats.last_name,
    username: stats.username
  };
}

function getProfileText(user) {
  initUser(user);
  const stats = getStats(user.id);

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
  const sent = await bot.sendMessage(
    chatId,
    getProfileText(targetUser),
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_to_message_id: replyToMessageId
    }
  );

  // запоминаем, чей это профиль, чтобы потом reply на это сообщение работал правильно
  db.profileMessages[String(sent.message_id)] = targetUser.id;
  saveDb();

  return sent;
}

function resolveTargetUserFromReply(msg) {
  if (!msg.reply_to_message) return null;

  const replyMsg = msg.reply_to_message;

  // если ответ на сообщение бота с профилем
  const profileOwnerId = db.profileMessages[String(replyMsg.message_id)];
  if (profileOwnerId) {
    return getStoredUser(profileOwnerId);
  }

  // обычный reply на сообщение пользователя
  if (replyMsg.from && !replyMsg.from.is_bot) {
    initUser(replyMsg.from);
    saveDb();
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
      targetUser = resolveTargetUserFromReply(msg);
    }

    if (!targetUser) {
      targetUser = msg.from;
    }

    initUser(targetUser);
    saveDb();

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

    // команды через / обрабатываются отдельно
    if (text.startsWith("/")) return;

    const command = rpCommands[text];
    if (!command) return;

    const sender = msg.from;
    initUser(sender);

    const target = resolveTargetUserFromReply(msg);

    if (!target) {
      await bot.sendMessage(
        msg.chat.id,
        "Ответь на сообщение игрока этой командой."
      );
      return;
    }

    initUser(target);

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

    const targetStats = getStats(target.id);
    targetStats[command.stat] += 1;
    targetStats.total += 1;

    saveDb();

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

// =========================
// ОШИБКИ POLLING
// =========================
bot.on("polling_error", (error) => {
  console.error("Polling error:", error?.message || error);
});
