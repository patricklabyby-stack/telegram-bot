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

// делаем имя ссылкой
function getUserLink(user) {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Пользователь";
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
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
  "уничтожить": "уничтожил",
  "лизнуть": "лизнул",
  "украсть": "украл",
  "похитить": "похитил",
  "вырубить": "вырубил",
  "раздавить": "раздавил",
  "забанить": "забанил",
  "кикнуть": "кикнул",
  "захилить": "вылечил",
  "спасти": "спас",
  "защитить": "защитил"
};

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const text = msg.text.trim().toLowerCase();

  if (!rpCommands[text]) return;

  // только ответом
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      msg.chat.id,
      "❗ Ответь на сообщение человека этой командой"
    );
  }

  const sender = getUserLink(msg.from);
  const target = getUserLink(msg.reply_to_message.from);

  // если сам себя
  if (msg.from.id === msg.reply_to_message.from.id) {
    return bot.sendMessage(
      msg.chat.id,
      `😅 ${sender} ${rpCommands[text]} сам(а) себя`,
      { parse_mode: "HTML" }
    );
  }

  bot.sendMessage(
    msg.chat.id,
    `✨ ${sender} ${rpCommands[text]} ${target}`,
    { parse_mode: "HTML" }
  );
});

// старт
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
`🔥 RP BOT

Команды (пиши ответом на сообщение):
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
лизнуть
украсть
похитить
вырубить
раздавить
забанить
кикнуть
захилить
спасти
защитить

💡 Просто ответь на сообщение и напиши слово`
  );
});
