const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const OWNER_ID = 7837011810;

if (!token) {
  console.error('BOT_TOKEN not found');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const app = express();

const greetings = {};
const waitingGreeting = {}; // chatId: { userId, mode: 'create' | 'edit' }

// проверка прав
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

// команды
const COMMANDS = [
  'create greeting',
  'edit greeting',
  'show greeting',
  'delete greeting',
  'cancel greeting'
];

// /start
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `👋 Привет! Я Artemwe Moderator.

Команды:
create greeting — создать приветствие
edit greeting — изменить приветствие
show greeting — показать приветствие
delete greeting — удалить приветствие
cancel greeting — отменить ввод

Можно использовать {name}

Пример:
Привет {name}! Добро пожаловать в группу.`
  );
});

// сообщения
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = msg.text?.trim();

    if (!text) return;
    if (msg.new_chat_members || msg.left_chat_member) return;

    const lower = text.toLowerCase();

    // если бот ждёт текст приветствия
    if (waitingGreeting[chatId]) {
      const session = waitingGreeting[chatId];

      // если пишет не тот человек, который начал
      if (session.userId !== userId) return;

      // отмена
      if (lower === 'cancel greeting') {
        delete waitingGreeting[chatId];
        await bot.sendMessage(chatId, '❌ Ввод приветствия отменён.');
        return;
      }

      // если вместо текста снова пишут команду
      if (COMMANDS.includes(lower)) {
        await bot.sendMessage(
          chatId,
          '❌ Сейчас бот ждёт текст приветствия. Напиши текст или используй: cancel greeting'
        );
        return;
      }

      greetings[chatId] = msg.text;
      delete waitingGreeting[chatId];

      if (session.mode === 'create') {
        await bot.sendMessage(chatId, '✅ Приветствие создано.');
      } else {
        await bot.sendMessage(chatId, '✅ Приветствие изменено.');
      }
      return;
    }

    // create greeting
    if (lower === 'create greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      if (greetings[chatId]) {
        await bot.sendMessage(
          chatId,
          '❌ Приветствие уже существует. Используй: edit greeting'
        );
        return;
      }

      waitingGreeting[chatId] = {
        userId,
        mode: 'create'
      };

      await bot.sendMessage(
        chatId,
        '✏️ Напишите текст приветствия.\nМожно использовать {name}\n\nДля отмены: cancel greeting'
      );
      return;
    }

    // edit greeting
    if (lower === 'edit greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      if (!greetings[chatId]) {
        await bot.sendMessage(
          chatId,
          '❌ Приветствия ещё нет. Сначала используй: create greeting'
        );
        return;
      }

      waitingGreeting[chatId] = {
        userId,
        mode: 'edit'
      };

      await bot.sendMessage(
        chatId,
        '✏️ Напишите новый текст приветствия.\nМожно использовать {name}\n\nДля отмены: cancel greeting'
      );
      return;
    }

    // show greeting
    if (lower === 'show greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      if (!greetings[chatId]) {
        await bot.sendMessage(chatId, '❌ Приветствие ещё не создано.');
        return;
      }

      await bot.sendMessage(
        chatId,
        `📌 Текущее приветствие:\n\n${greetings[chatId]}`
      );
      return;
    }

    // delete greeting
    if (lower === 'delete greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
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

    // cancel greeting
    if (lower === 'cancel greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      if (!waitingGreeting[chatId]) {
        await bot.sendMessage(chatId, '❌ Сейчас нет активного ввода приветствия.');
        return;
      }

      if (waitingGreeting[chatId].userId !== userId && userId !== OWNER_ID) {
        await bot.sendMessage(chatId, '❌ Ты не можешь отменить чужой ввод.');
        return;
      }

      delete waitingGreeting[chatId];
      await bot.sendMessage(chatId, '❌ Ввод приветствия отменён.');
      return;
    }
  } catch (error) {
    console.error('Message error:', error.message);
  }
});

// новые участники
bot.on('new_chat_members', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const greeting = greetings[chatId];

    if (!greeting) return;

    for (const user of msg.new_chat_members) {
      if (user.is_bot) continue;

      const name = user.first_name || user.username || 'друг';
      const finalText = greeting.replace(/\{name\}/g, name);

      await bot.sendMessage(chatId, finalText);
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
