const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN not found');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const app = express();

const greetings = {};
const waitingGreeting = {};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Привет! Я работаю.');
});

bot.on('message', (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim().toLowerCase();

  if (text === 'create greeting') {
    waitingGreeting[chatId] = true;
    bot.sendMessage(chatId, 'Какое приветствие вы хотите создать?');
    return;
  }

  if (waitingGreeting[chatId]) {
    greetings[chatId] = msg.text;
    waitingGreeting[chatId] = false;
    bot.sendMessage(chatId, '✅ Приветствие сохранено.');
    return;
  }
});

bot.on('new_chat_members', (msg) => {
  const chatId = msg.chat.id;
  const greeting = greetings[chatId];

  if (!greeting) return;

  msg.new_chat_members.forEach((user) => {
    if (user.is_bot) return;
    bot.sendMessage(chatId, greeting);
  });
});

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server started');
});
