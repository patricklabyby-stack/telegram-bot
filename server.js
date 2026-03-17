const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;

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
// СТАТИСТИКА
// =========================
const userStats = {};

function initUser(user) {
  if (!user || !user.id) return;

  if (!userStats[user.id]) {
    userStats[user.id] = {
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
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getUserName(user) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || user.username || "Пользователь";
}

function getUserLink(user) {
  return `<a href="tg://user?id=${user.id}">${escapeHtml(getUserName(user))}</a>`;
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
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
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

/profile — показать профиль
/profile ответом — показать профиль человека

Как использовать:
1. Ответь на сообщение человека
2. Напиши РП команду

Пример:
убить`
  );
});

// =========================
// /profile
// =========================
bot.onText(/\/profile/, (msg) => {
  const targetUser = msg.reply_to_message ? msg.reply_to_message.from : msg.from;

  initUser(targetUser);

  const stats = userStats[targetUser.id];

  bot.sendMessage(
    msg.chat.id,
    `👤 Профиль пользователя

Имя: ${getUserLink(targetUser)}
ID: ${targetUser.id}

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

🔥 Всего взаимодействий: ${stats.total}`,
    { parse_mode: "HTML" }
  );
});

// =========================
// ОБРАБОТКА СООБЩЕНИЙ
// =========================
bot.on("message", (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim().toLowerCase();

  // команды /start и /profile не трогаем тут
  if (text.startsWith("/")) return;

  const command = rpCommands[text];
  if (!command) return;

  // только ответом на сообщение
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      msg.chat.id,
      "Ответь на сообщение человека этой командой."
    );
  }

  const sender = msg.from;
  const target = msg.reply_to_message.from;

  initUser(sender);
  initUser(target);

  // если сам себе
  if (sender.id === target.id) {
    return bot.sendMessage(
      msg.chat.id,
      `😅 ${getUserLink(sender)} ${command.text} самого себя`,
      { parse_mode: "HTML" }
    );
  }

  // прибавляем статистику цели
  userStats[target.id][command.stat] += 1;
  userStats[target.id].total += 1;

  bot.sendMessage(
    msg.chat.id,
    `${command.emoji} ${getUserLink(sender)} ${command.text} ${getUserLink(target)}`,
    { parse_mode: "HTML" }
  );
});
