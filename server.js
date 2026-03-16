const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const express = require("express");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

/* DATABASE */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* создаем таблицу */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT
    );
  `);
}

initDB();

/* состояния */
const waitingGreeting = {};

/* только админ или ты */
const OWNER_ID = 7837011810;

async function isAdmin(chatId, userId) {
  if (userId === OWNER_ID) return true;

  try {
    const member = await bot.getChatMember(chatId, userId);
    return (
      member.status === "administrator" ||
      member.status === "creator"
    );
  } catch {
    return false;
  }
}

/* команды */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!msg.text) return;

  /* создать приветствие */
  if (msg.text === "create greeting") {

    const admin = await isAdmin(chatId, userId);
    if (!admin) {
      return bot.sendMessage(chatId, "❌ Только админ может это делать.");
    }

    waitingGreeting[chatId] = true;

    return bot.sendMessage(
      chatId,
      "Напиши текст нового приветствия.\n\nМожно использовать {name}"
    );
  }

  /* показать приветствие */
  if (msg.text === "show greeting") {

    const result = await pool.query(
      "SELECT text FROM greetings WHERE chat_id=$1",
      [chatId]
    );

    if (result.rows.length === 0) {
      return bot.sendMessage(chatId, "❌ Приветствие ещё не создано.");
    }

    return bot.sendMessage(
      chatId,
      "📌 Текущее приветствие:\n\n" + result.rows[0].text
    );
  }

  /* сохранить приветствие */
  if (waitingGreeting[chatId]) {

    await pool.query(
      `
      INSERT INTO greetings(chat_id,text)
      VALUES($1,$2)
      ON CONFLICT(chat_id)
      DO UPDATE SET text=$2
      `,
      [chatId, msg.text]
    );

    waitingGreeting[chatId] = false;

    return bot.sendMessage(chatId, "✅ Приветствие создано.");
  }
});

/* когда заходит новый человек */
bot.on("new_chat_members", async (msg) => {

  const chatId = msg.chat.id;

  const result = await pool.query(
    "SELECT text FROM greetings WHERE chat_id=$1",
    [chatId]
  );

  if (result.rows.length === 0) return;

  const greeting = result.rows[0].text;

  msg.new_chat_members.forEach((user) => {

    const name = user.first_name;
    const text = greeting.replace("{name}", name);

    bot.sendMessage(chatId, text);
  });
});

/* сервер чтобы Render не выключал бота */
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server started");
});
