const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;

// чтобы Render / сервер не засыпал
app.get("/", (req, res) => {
  res.send("Бот работает");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Функция получения красивого имени
function getFullName(user) {
  if (!user) return "Неизвестный";

  const firstName = user.first_name || "";
  const lastName = user.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName.length > 0) return fullName;

  if (user.username) return user.username;

  return "Пользователь";
}

// РП команды
const rpCommands = {
  "убить": "убил",
  "обнять": "обнял",
  "поцеловать": "поцеловал",
  "ударить": "ударил",
  "укусить": "укусил",
  "пнуть": "пнул",
  "погладить": "погладил",
  "задушить": "задушил",
  "расстрелять": "расстрелял",
  "заскамить": "заскамил",
  "уничтожить": "уничтожил"
};

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim().toLowerCase();
  const senderName = getFullName(msg.from);

  // проверяем, есть ли такая команда
  if (!rpCommands[text]) return;

  // команда должна быть ответом на сообщение
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      msg.chat.id,
      "Ответь этой командой на сообщение человека.\n\nНапример: ответом на сообщение напиши: убить"
    );
  }

  const targetName = getFullName(msg.reply_to_message.from);

  if (msg.from.id === msg.reply_to_message.from.id) {
    return bot.sendMessage(
      msg.chat.id,
      `${senderName} ${rpCommands[text]} самого себя 😅`
    );
  }

  bot.sendMessage(
    msg.chat.id,
    `${senderName} ${rpCommands[text]} ${targetName}`
  );
});

// команда /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`Привет 👋

Бот с РП командами работает.

Команды:
убить
обнять
поцеловать
ударить
укусить
пнуть
погладить
задушить
расстрелять
заскамить
уничтожить

Как использовать:
1. Ответь на сообщение человека
2. Напиши слово-команду

Пример:
убить`
  );
});
