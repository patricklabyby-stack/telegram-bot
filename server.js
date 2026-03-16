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
const OWNER_ID = 7837011810;

// проверка: ты или админ
async function canManage(chatId, userId) {
  if (userId === OWNER_ID) return true;

  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === 'administrator' || member.status === 'creator';
  } catch (error) {
    console.error('Admin check error:', error.message);
    return false;
  }
}

// старт
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '👋 Привет! Я работаю.\n\nКоманды:\ncreate greeting\nshow greeting\ndelete greeting'
  );
});

// все сообщения
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = msg.text?.trim();

    if (!text) return;

    // пропускаем системные сообщения
    if (msg.new_chat_members || msg.left_chat_member) return;

    // create greeting
    if (text.toLowerCase() === 'create greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админ может управлять приветствием.');
        return;
      }

      waitingGreeting[chatId] = userId;
      await bot.sendMessage(chatId, 'Напиши текст приветствия');
      return;
    }

    // show greeting
    if (text.toLowerCase() === 'show greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админ может управлять приветствием.');
        return;
      }

      if (!greetings[chatId]) {
        await bot.sendMessage(chatId, '❌ Приветствие ещё не создано.');
        return;
      }

      await bot.sendMessage(chatId, `📌 Текущее приветствие:\n\n${greetings[chatId]}`);
      return;
    }

    // delete greeting
    if (text.toLowerCase() === 'delete greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админ может управлять приветствием.');
        return;
      }

      if (!greetings[chatId]) {
        await bot.sendMessage(chatId, '❌ Приветствие уже удалено или не создано.');
        return;
      }

      delete greetings[chatId];
      delete waitingGreeting[chatId];

      await bot.sendMessage(chatId, '✅ Приветствие удалено.');
      return;
    }

    // если бот ждёт текст приветствия
    if (waitingGreeting[chatId] && waitingGreeting[chatId] === userId) {
      greetings[chatId] = msg.text;
      delete waitingGreeting[chatId];

      await bot.sendMessage(chatId, '✅ Приветствие сохранено.');
      return;
    }
  } catch (error) {
    console.error('Message error:', error.message);
  }
});

// когда заходят новые участники
bot.on('new_chat_members', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const greeting = greetings[chatId];

    if (!greeting) return;

    for (const user of msg.new_chat_members) {
      if (user.is_bot) continue;
      await bot.sendMessage(chatId, greeting);
    }
  } catch (error) {
    console.error('new_chat_members error:', error.message);
  }
});

// сервер для Render
app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server started');
});
