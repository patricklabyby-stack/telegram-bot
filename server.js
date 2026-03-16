const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Pool } = require('pg');

const token = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_ID = 7837011810;

if (!token) {
  console.error('BOT_TOKEN not found');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const app = express();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const waitingGreeting = {};

// создать таблицу
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT NOT NULL
    )
  `);
  console.log('DB ready');
}

// получить приветствие
async function getGreeting(chatId) {
  const result = await pool.query(
    'SELECT text FROM greetings WHERE chat_id = $1',
    [String(chatId)]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].text;
}

// сохранить приветствие
async function saveGreeting(chatId, text) {
  await pool.query(
    `
    INSERT INTO greetings (chat_id, text)
    VALUES ($1, $2)
    ON CONFLICT (chat_id)
    DO UPDATE SET text = EXCLUDED.text
    `,
    [String(chatId), text]
  );
}

// удалить приветствие
async function removeGreeting(chatId) {
  await pool.query(
    'DELETE FROM greetings WHERE chat_id = $1',
    [String(chatId)]
  );
}

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

// старт
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `👋 Привет! Я работаю.

Команды:
create greeting
edit greeting
show greeting
delete greeting`
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

    // если ждём текст приветствия
    if (waitingGreeting[chatId] && waitingGreeting[chatId] === userId) {
      await saveGreeting(chatId, msg.text);
      delete waitingGreeting[chatId];

      await bot.sendMessage(chatId, '✅ Приветствие сохранено.');
      return;
    }

    // create greeting
    if (lower === 'create greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      waitingGreeting[chatId] = userId;
      await bot.sendMessage(chatId, 'Какое приветствие вы хотите создать?');
      return;
    }

    // edit greeting
    if (lower === 'edit greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      const greeting = await getGreeting(chatId);
      if (!greeting) {
        await bot.sendMessage(chatId, '❌ Приветствие ещё не создано.');
        return;
      }

      waitingGreeting[chatId] = userId;
      await bot.sendMessage(chatId, 'Напиши новый текст приветствия.');
      return;
    }

    // show greeting
    if (lower === 'show greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      const greeting = await getGreeting(chatId);
      if (!greeting) {
        await bot.sendMessage(chatId, '❌ Приветствие ещё не создано.');
        return;
      }

      await bot.sendMessage(chatId, `📌 Текущее приветствие:\n\n${greeting}`);
      return;
    }

    // delete greeting
    if (lower === 'delete greeting') {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, '❌ Только админы могут управлять приветствием.');
        return;
      }

      const greeting = await getGreeting(chatId);
      if (!greeting) {
        await bot.sendMessage(chatId, '❌ Приветствие уже удалено или не создано.');
        return;
      }

      await removeGreeting(chatId);
      delete waitingGreeting[chatId];

      await bot.sendMessage(chatId, '✅ Приветствие удалено.');
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
    const greeting = await getGreeting(chatId);

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

// сервер
app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Server started');
    });
  })
  .catch((error) => {
    console.error('DB init error:', error.message);
    process.exit(1);
  });
