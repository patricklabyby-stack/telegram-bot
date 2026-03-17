const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Бот работает");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// =========================
// БАЗА СТАТЫ В ПАМЯТИ
// =========================
const userStats = {};

// создать стату если ее нет
function initUser(user) {
  if (!userStats[user.id]) {
    userStats[user.id] = {
      kills: 0,
      hugs: 0,
      kisses: 0,
      hits: 0,
      bites: 0
    };
  }
}

// безопасное имя
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// имя пользователя ссылкой
function getUserLink(user) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  const name = fullName || user.username || "Пользователь";
  return `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>`;
}

// считаем все взаимодействия
function getTotalStats(stats) {
  return (
    stats.kills +
    stats.hugs +
    stats.kisses +
    stats.hits +
    stats.bites
  );
}

// РП команды
const rpCommands = {
  "убить": { text: "убил", stat: "kills" },
  "обнять": { text: "обнял", stat: "hugs" },
  "поцеловать": { text: "поцеловал", stat: "kisses" },
  "ударить": { text: "ударил", stat: "hits" },
  "укусить": { text: "укусил", stat: "bites" }
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

Как использовать:
1. Ответь на сообщение человека
2. Напиши команду, например: убить

/profile — твой профиль
/profile ответом — профиль другого человека`
  );
});

// =========================
// /profile
// =========================
bot.onText(/\/profile/, (msg) => {
  const targetUser = msg.reply_to_message ? msg.reply_to_message.from : msg.from;

  initUser(targetUser);
  const stats = userStats[targetUser.id];
  const total = getTotalStats(stats);

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

🔥 Всего взаимодействий: ${total}`,
    { parse_mode: "HTML" }
  );
});

// =========================
// ОБРАБОТКА РП КОМАНД
// =========================
bot.on("message", (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim().toLowerCase();

  // чтобы /start и /profile не обрабатывались тут
  if (text.startsWith("/")) return;

  const command = rpCommands[text];
  if (!command) return;

  // команда только ответом на сообщение
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      msg.chat.id,
      "Ответь на сообщение игрока этой командой."
    );
  }

  const sender = msg.from;
  const target = msg.reply_to_message.from;

  initUser(sender);
  initUser(target);

  // сам себя
  if (sender.id === target.id) {
    return bot.sendMessage(
      msg.chat.id,
      `😅 ${getUserLink(sender)} ${command.text} самого себя`,
      { parse_mode: "HTML" }
    );
  }

  // увеличиваем стату ТОМУ, кого выбрали целью
  userStats[target.id][command.stat] += 1;

  return bot.sendMessage(
    msg.chat.id,
    `✨ ${getUserLink(sender)} ${command.text} ${getUserLink(target)}`,
    { parse_mode: "HTML" }
  );
});
