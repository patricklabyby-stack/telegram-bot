const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { Pool } = require("pg");

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_ID = 7837011810;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN not found");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const waitingGreeting = new Map(); // chatId -> { userId, mode: "create" | "edit" }

// ---------- DB ----------
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("DB ready");
}

async function getGreeting(chatId) {
  const result = await pool.query(
    "SELECT text FROM greetings WHERE chat_id = $1",
    [String(chatId)]
  );
  return result.rows.length ? result.rows[0].text : null;
}

async function createOrUpdateGreeting(chatId, text) {
  await pool.query(
    `
    INSERT INTO greetings (chat_id, text, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (chat_id)
    DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()
    `,
    [String(chatId), text]
  );
}

async function deleteGreeting(chatId) {
  await pool.query(
    "DELETE FROM greetings WHERE chat_id = $1",
    [String(chatId)]
  );
}

// ---------- права ----------
async function canManage(chatId, userId) {
  if (userId === OWNER_ID) return true;

  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === "administrator" || member.status === "creator";
  } catch (error) {
    console.error("Admin check error:", error.message);
    return false;
  }
}

// ---------- start ----------
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `👋 Привет! Я Artemwe Moderator.

Команды:
create greeting
edit greeting
show greeting
delete greeting
cancel greeting

Можно использовать {name}

Пример:
Привет {name}! Добро пожаловать в группу.`
  );
});

// ---------- сообщения ----------
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = msg.text?.trim();

    if (!text) return;
    if (msg.new_chat_members || msg.left_chat_member) return;

    const lower = text.toLowerCase();

    // если бот ждёт текст
    if (waitingGreeting.has(chatId)) {
      const session = waitingGreeting.get(chatId);

      if (session.userId !== userId) return;

      if (lower === "cancel greeting") {
        waitingGreeting.delete(chatId);
        await bot.sendMessage(chatId, "❌ Ввод приветствия отменён.");
        return;
      }

      if (
        lower === "create greeting" ||
        lower === "edit greeting" ||
        lower === "show greeting" ||
        lower === "delete greeting"
      ) {
        await bot.sendMessage(
          chatId,
          "❌ Сейчас бот ждёт текст приветствия. Напиши текст или используй: cancel greeting"
        );
        return;
      }

      await createOrUpdateGreeting(chatId, text);
      waitingGreeting.delete(chatId);

      if (session.mode === "create") {
        await bot.sendMessage(chatId, "✅ Приветствие создано.");
      } else {
        await bot.sendMessage(chatId, "✅ Приветствие изменено.");
      }
      return;
    }

    // create greeting
    if (lower === "create greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const existing = await getGreeting(chatId);

      if (existing) {
        await bot.sendMessage(
          chatId,
          "❌ Приветствие уже создано. Используй: edit greeting"
        );
        return;
      }

      waitingGreeting.set(chatId, {
        userId,
        mode: "create"
      });

      await bot.sendMessage(chatId, "✏️ Напиши текст приветствия");
      return;
    }

    // edit greeting
    if (lower === "edit greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const existing = await getGreeting(chatId);

      if (!existing) {
        await bot.sendMessage(
          chatId,
          "❌ Приветствие ещё не создано. Используй: create greeting"
        );
        return;
      }

      waitingGreeting.set(chatId, {
        userId,
        mode: "edit"
      });

      await bot.sendMessage(chatId, "✏️ Напиши новый текст приветствия");
      return;
    }

    // show greeting
    if (lower === "show greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const greeting = await getGreeting(chatId);

      if (!greeting) {
        await bot.sendMessage(chatId, "❌ Приветствие ещё не создано.");
        return;
      }

      await bot.sendMessage(chatId, `📌 Текущее приветствие:\n\n${greeting}`);
      return;
    }

    // delete greeting
    if (lower === "delete greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const greeting = await getGreeting(chatId);

      if (!greeting) {
        await bot.sendMessage(chatId, "❌ Приветствие уже удалено или не создано.");
        return;
      }

      await deleteGreeting(chatId);
      waitingGreeting.delete(chatId);

      await bot.sendMessage(chatId, "✅ Приветствие удалено.");
      return;
    }

    // cancel greeting
    if (lower === "cancel greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      if (!waitingGreeting.has(chatId)) {
        await bot.sendMessage(chatId, "❌ Сейчас нет активного ввода приветствия.");
        return;
      }

      const session = waitingGreeting.get(chatId);

      if (session.userId !== userId && userId !== OWNER_ID) {
        await bot.sendMessage(chatId, "❌ Ты не можешь отменить чужой ввод.");
        return;
      }

      waitingGreeting.delete(chatId);
      await bot.sendMessage(chatId, "❌ Ввод приветствия отменён.");
      return;
    }
  } catch (error) {
    console.error("Message error:", error.message);
  }
});

// ---------- новые участники ----------
bot.on("new_chat_members", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const greeting = await getGreeting(chatId);

    if (!greeting) return;

    for (const user of msg.new_chat_members) {
      if (user.is_bot) continue;

      const name = user.first_name || user.username || "друг";
      const finalText = greeting.replace(/\{name\}/g, name);

      await bot.sendMessage(chatId, finalText);
    }
  } catch (error) {
    console.error("new_chat_members error:", error.message);
  }
});

// ---------- web ----------
app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("DB init error:", error.message);
    process.exit(1);
  });

bot.on("polling_error", (error) => {
  console.error("Polling error:", error.message);
});
