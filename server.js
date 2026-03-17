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

// хранилище статистики
const userStats = {};

// создание профиля если его нет
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

// имя ссылкой
function getUserLink(user) {
  const name =
    `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Пользователь";
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

// рп команды
const rpCommands = {
  "убить": { text: "убил", stat: "kills" },
  "обнять": { text: "обнял", stat: "hugs" },
  "поцеловать": { text: "поцеловал", stat: "kisses" },
  "ударить": { text: "ударил", stat: "hits" },
  "укусить": { text: "укусил", stat: "bites" }
};

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim().toLowerCase();

  // /profile
  if (text === "/profile") {
    const targetUser = msg.reply_to_message ? msg.reply_to_message.from : msg.from;

    initUser(targetUser);

    const stats = userStats[targetUser.id];
    const total =
      stats.kills +
      stats.hugs +
      stats.kisses +
      stats.hits +
      stats.bites;

    return bot.sendMessage(
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
  }

  // РП команды
  if (!rpCommands[text]) return;

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

  if (sender.id === target.id) {
    return bot.sendMessage(
      msg.chat.id,
      `😅 ${getUserLink(sender)} ${rpCommands[text].text} самого себя`,
      { parse_mode: "HTML" }
    );
  }

  // прибавляем статистику ТОМУ, кого ударили/обняли/убили
  userStats[target.id][rpCommands[text].stat]++;

  return bot.sendMessage(
    msg.chat.id,
    `✨ ${getUserLink(sender)} ${rpCommands[text].text} ${getUserLink(target)}`,
    { parse_mode: "HTML" }
  );
});

// /start
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

/profile — показать профиль
(или ответь на сообщение и напиши /profile)`
  );
});
