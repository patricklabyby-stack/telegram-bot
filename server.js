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

const waitingGreeting = {}; // { [chatId]: { userId, mode } }
const COMMANDS = [
  "create greeting",
  "edit greeting",
  "show greeting",
  "delete greeting",
  "cancel greeting"
];

// ---------- DB ----------
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS greetings (
      chat_id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
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

async function setGreeting(chatId, text) {
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
  try {
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
  } catch (error) {
    console.error("/start error:", error.message);
  }
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

    // Если бот ждёт текст приветствия
    if (waitingGreeting[chatId]) {
      const session = waitingGreeting[chatId];

      // Только тот, кто начал ввод
      if (session.userId !== userId) return;

      // Отмена
      if (lower === "cancel greeting") {
        delete waitingGreeting[chatId];
        await bot.sendMessage(chatId, "❌ Ввод приветствия отменён.");
        return;
      }

      // Не даём сохранить команду как приветствие
      if (COMMANDS.includes(lower)) {
        await bot.sendMessage(
          chatId,
          "❌ Сейчас бот ждёт текст приветствия. Напиши текст или используй: cancel greeting"
        );
        return;
      }

      await setGreeting(chatId, text);
      delete waitingGreeting[chatId];

      await bot.sendMessage(
        chatId,
        session.mode === "create"
          ? "✅ Приветствие создано."
          : "✅ Приветствие изменено."
      );
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
          "❌ Приветствие уже существует. Используй: edit greeting"
        );
        return;
      }

      waitingGreeting[chatId] = {
        userId,
        mode: "create"
      };

      await bot.sendMessage(
        chatId,
        "✏️ Напиши текст приветствия.\nМожно использовать {name}\n\nДля отмены: cancel greeting"
      );
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
          "❌ Приветствия ещё нет. Сначала используй: create greeting"
        );
        return;
      }

      waitingGreeting[chatId] = {
        userId,
        mode: "edit"
      };

      await bot.sendMessage(
        chatId,
        "✏️ Напиши новый текст приветствия.\nМожно использовать {name}\n\nДля отмены: cancel greeting"
      );
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

      await removeGreeting(chatId);
      delete waitingGreeting[chatId];

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

      if (!waitingGreeting[chatId]) {
        await bot.sendMessage(chatId, "❌ Сейчас нет активного ввода приветствия.");
        return;
      }

      if (waitingGreeting[chatId].userId !== userId && userId !== OWNER_ID) {
        await bot.sendMessage(chatId, "❌ Ты не можешь отменить чужой ввод.");
        return;
      }

      delete waitingGreeting[chatId];
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

// ---------- express ----------
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
