const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { Pool } = require("pg");

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_ID = 7837011810;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const waitingGreeting = new Map();

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT NOT NULL
    )
  `);
}

async function getGreeting(chatId) {
  const res = await pool.query(
    "SELECT text FROM greetings WHERE chat_id=$1",
    [String(chatId)]
  );

  return res.rows.length ? res.rows[0].text : null;
}

async function saveGreeting(chatId, text) {
  await pool.query(
    `INSERT INTO greetings (chat_id,text)
     VALUES ($1,$2)
     ON CONFLICT (chat_id)
     DO UPDATE SET text=$2`,
    [String(chatId), text]
  );
}

async function deleteGreeting(chatId) {
  await pool.query(
    "DELETE FROM greetings WHERE chat_id=$1",
    [String(chatId)]
  );
}

async function isAdmin(chatId, userId) {
  if (userId === OWNER_ID) return true;

  const member = await bot.getChatMember(chatId, userId);

  return (
    member.status === "administrator" ||
    member.status === "creator"
  );
}

bot.on("message", async msg => {

  if (!msg.text) return;
  if (msg.new_chat_members) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().toLowerCase();

  // ===== ЕСЛИ БОТ ЖДЕТ ТЕКСТ =====

  if (waitingGreeting.has(chatId)) {

    const session = waitingGreeting.get(chatId);

    if (session !== userId) return;

    if (text === "cancel greeting") {
      waitingGreeting.delete(chatId);

      bot.sendMessage(
        chatId,
        "❌ Ввод приветствия отменён."
      );

      return;
    }

    await saveGreeting(chatId, msg.text);

    waitingGreeting.delete(chatId);

    if (session.mode === "edit") {
      bot.sendMessage(chatId, "✅ Приветствие изменено.");
    } else {
      bot.sendMessage(chatId, "✅ Приветствие создано.");
    }

    return;
  }

  // ===== КОМАНДЫ =====

  if (text === "create greeting") {

    if (!(await isAdmin(chatId, userId))) {
      bot.sendMessage(chatId,"❌ Только админ.");
      return;
    }

    const greeting = await getGreeting(chatId);

    if (greeting) {
      bot.sendMessage(
        chatId,
        "❌ Приветствие уже создано. Используй: edit greeting"
      );
      return;
    }

    waitingGreeting.set(chatId, userId);

    bot.sendMessage(
      chatId,
      "✏️ Напиши текст приветствия"
    );

    return;
  }

  if (text === "edit greeting") {

    if (!(await isAdmin(chatId, userId))) {
      bot.sendMessage(chatId,"❌ Только админ.");
      return;
    }

    const greeting = await getGreeting(chatId);

    if (!greeting) {
      bot.sendMessage(
        chatId,
        "❌ Сначала создай: create greeting"
      );
      return;
    }

    waitingGreeting.set(chatId, userId);

    bot.sendMessage(
      chatId,
      "✏️ Напиши новый текст приветствия"
    );

    return;
  }

  if (text === "delete greeting") {

    if (!(await isAdmin(chatId, userId))) {
      bot.sendMessage(chatId,"❌ Только админ.");
      return;
    }

    await deleteGreeting(chatId);

    bot.sendMessage(
      chatId,
      "✅ Приветствие удалено."
    );

    return;
  }

});

bot.on("new_chat_members", async msg => {

  const greeting = await getGreeting(msg.chat.id);

  if (!greeting) return;

  for (const user of msg.new_chat_members) {

    if (user.is_bot) continue;

    const name = user.first_name;

    const text = greeting.replace("{name}", name);

    bot.sendMessage(msg.chat.id, text);
  }

});

app.get("/", (req,res)=>res.send("Bot working"));

const PORT = process.env.PORT || 3000;

initDB().then(()=>{
  app.listen(PORT);
});
