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

// chatId -> { userId, mode: "create" | "edit" }
const waitingGreeting = new Map();

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

  if (result.rows.length === 0) return null;
  return result.rows[0].text;
}

async function saveGreeting(chatId, text) {
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

async function removeGreeting(chatId) {
  await pool.query(
    "DELETE FROM greetings WHERE chat_id = $1",
    [String(chatId)]
  );
}

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

bot.onText(/\/start/, async (msg) => {
  try {
    await bot.sendMessage(
      msg.chat.id,
      `👋 Привет! Я Artemwe Moderator.

Команды:
create greeting
edit greeting
show greeting
delete greeting
cancel greeting

Как работает:
1. create greeting
2. бот просит текст
3. ты отправляешь текст
4. бот сохраняет его

Можно использовать {name}

Пример:
Привет {name}! Добро пожаловать в группу.`
    );
  } catch (error) {
    console.error("/start error:", error.message);
  }
});

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const originalText = msg.text?.trim();

    if (!originalText) return;
    if (msg.new_chat_members || msg.left_chat_member) return;

    const text = originalText.toLowerCase();

    // 1. если бот ждёт текст приветствия
    if (waitingGreeting.has(chatId)) {
      const session = waitingGreeting.get(chatId);

      if (session.userId !== userId) return;

      if (text === "cancel greeting") {
        waitingGreeting.delete(chatId);
        await bot.sendMessage(chatId, "❌ Ввод приветствия отменён.");
        return;
      }

      if (
        text === "create greeting" ||
        text === "edit greeting" ||
        text === "show greeting" ||
        text === "delete greeting"
      ) {
        await bot.sendMessage(
          chatId,
          "❌ Сейчас бот ждёт текст приветствия. Напиши текст или используй: cancel greeting"
        );
        return;
      }

      await saveGreeting(chatId, originalText);
      waitingGreeting.delete(chatId);

      if (session.mode === "edit") {
        await bot.sendMessage(chatId, "✅ Приветствие изменено.");
      } else {
        await bot.sendMessage(chatId, "✅ Приветствие создано.");
      }

      return;
    }

    // 2. create greeting
    if (text === "create greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (currentGreeting) {
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

    // 3. edit greeting
    if (text === "edit greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
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

    // 4. show greeting
    if (text === "show greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
        await bot.sendMessage(chatId, "❌ Приветствие ещё не создано.");
        return;
      }

      await bot.sendMessage(chatId, `📌 Текущее приветствие:\n\n${currentGreeting}`);
      return;
    }

    // 5. delete greeting
    if (text === "delete greeting") {
      const allowed = await canManage(chatId, userId);

      if (!allowed) {
        await bot.sendMessage(chatId, "❌ Только админы могут управлять приветствием.");
        return;
      }

      const currentGreeting = await getGreeting(chatId);

      if (!currentGreeting) {
        await bot.sendMessage(chatId, "❌ Приветствие уже удалено или не создано.");
        return;
      }

      await removeGreeting(chatId);
      waitingGreeting.delete(chatId);

      await bot.sendMessage(chatId, "✅ Приветствие удалено.");
      return;
    }

    // 6. cancel greeting
    if (text === "cancel greeting") {
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
