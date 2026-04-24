const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;
const token = process.env.BOT_TOKEN;

if (!token) throw new Error("BOT_TOKEN не найден");

const bot = new TelegramBot(token, { polling: true });

app.get("/", (req, res) => {
  res.send("Бот работает без базы данных");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const activeBombs = {};
const activeGuessWordGames = {};
const activeGuessNumberGames = {};
const activeEmojiGuessGames = {};
const activeHangmanGames = {};
const activeHangmanPvPGames = {};

const HELP_ARTICLE_URL = "https://teletype.in/@mini_moderator/KBilsLxWXpV";

const TRUTH_QUESTIONS = [
  "Что ты скрываешь чаще всего? 👀",
  "Кому ты писал(а) последним?",
  "Какой самый кринжовый поступок у тебя был?",
  "Чего ты боишься больше всего?",
  "На кого ты чаще всего злишься?",
  "Какой секрет ты никому не рассказывал(а)?",
  "Кого ты хотел(а) бы обнять прямо сейчас?",
  "Когда ты в последний раз врал(а)?",
  "Что тебя бесит в людях больше всего?",
  "Какой твой самый странный сон?"
];

const DARE_TASKS = [
  "Напиши в чат 3 смешных эмодзи подряд 😹🔥🐸",
  "Поставь себе смешной статус на 10 минут 😅",
  "Напиши в чат «я легенда этой группы» 😎",
  "Отправь одно сообщение только капсом 📢",
  "Напиши комплимент первому человеку, который ответит 💬",
  "Отправь в чат самый странный смайлик, который найдёшь 🤨",
  "Напиши «я сегодня подозрительно добрый(ая)» 😇",
  "Скажи в чат одно случайное слово без объяснений 🌀",
  "Придумай себе смешную кличку на 5 минут 🤡",
  "Напиши в чат «мне срочно нужен чай и отдых» ☕"
];

const WOULD_BE_VARIANTS = [
  "детективом 🕵️",
  "космонавтом 🚀",
  "владельцем шаурмичной 🌯",
  "ночным баристой ☕",
  "королём дивана 👑",
  "охотником за мемами 😂",
  "смотрителем маяка 🌊",
  "тайным агентом 🕶️",
  "водителем такси 🚕",
  "мастером странных советов 🧠"
];

const GUESS_WORD_ITEMS = [
  { word: "кровать", hint: "на чем ты спишь" },
  { word: "диван", hint: "на чем ты сидишь дома" },
  { word: "телефон", hint: "чем звонят и пишут сообщения" },
  { word: "мороженое", hint: "холодная сладость" },
  { word: "собака", hint: "лучший друг человека" },
  { word: "кошка", hint: "домашнее животное" },
  { word: "машина", hint: "на ней ездят" },
  { word: "пицца", hint: "это еда" },
  { word: "школа", hint: "куда ходят учиться" },
  { word: "будильник", hint: "что звонит утром" },
  { word: "арбуз", hint: "большая ягода с полосками" },
  { word: "банкомат", hint: "через него снимают деньги" },
  { word: "звезда", hint: "светит на небе ночью" },
  { word: "поезд", hint: "ездит по рельсам" },
  { word: "самолет", hint: "летает в небе" }
];

const EMOJI_GUESS_ITEMS = [
  { word: "яблоко", emojis: "🍎" },
  { word: "банан", emojis: "🍌🟡" },
  { word: "лимон", emojis: "🍋🟡" },
  { word: "кошка", emojis: "🐱🏠" },
  { word: "собака", emojis: "🐶🏠" },
  { word: "телефон", emojis: "📱☎️" },
  { word: "кровать", emojis: "🛏️😴" },
  { word: "книга", emojis: "📚" },
  { word: "пицца", emojis: "🍕" },
  { word: "машина", emojis: "🚗" },
  { word: "солнце", emojis: "☀️" },
  { word: "луна", emojis: "🌙" },
  { word: "мороженое", emojis: "🍦" },
  { word: "рыбка", emojis: "🐟💧" },
  { word: "будильник", emojis: "⏰😴" }
];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getUserName(user) {
  if (!user) return "Пользователь";
  const first = (user.first_name || "").trim();
  const last = (user.last_name || "").trim();
  const username = (user.username || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (username) return `@${username}`;
  return "Пользователь";
}

function getUserLink(user) {
  if (!user || !user.id) return escapeHtml(getUserName(user));
  return `<a href="tg://user?id=${user.id}">${escapeHtml(getUserName(user))}</a>`;
}

function getChatKey(chatId) {
  return String(chatId);
}

function getRandomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatMaskedWord(word, guessedLetters) {
  return word.split("").map(ch => (guessedLetters.has(ch) ? ch : "_")).join(" ");
}

async function safeSendMessage(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error("Ошибка sendMessage:", error?.message || error);
    return null;
  }
}

function startGuessWord(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeGuessWordGames[getChatKey(chatId)] = {
    ...item,
    ownerUserId: user.id,
    ownerUserName: getUserName(user)
  };
  return activeGuessWordGames[getChatKey(chatId)];
}

function clearGuessWord(chatId) {
  delete activeGuessWordGames[getChatKey(chatId)];
}

function startGuessNumber(chatId, user) {
  const target = Math.floor(Math.random() * 20) + 1;
  activeGuessNumberGames[getChatKey(chatId)] = {
    target,
    ownerUserId: user.id,
    ownerUserName: getUserName(user)
  };
  return activeGuessNumberGames[getChatKey(chatId)];
}

function clearGuessNumber(chatId) {
  delete activeGuessNumberGames[getChatKey(chatId)];
}

function startEmojiGuess(chatId, user) {
  const item = getRandomFromArray(EMOJI_GUESS_ITEMS);
  activeEmojiGuessGames[getChatKey(chatId)] = {
    ...item,
    ownerUserId: user.id,
    ownerUserName: getUserName(user)
  };
  return activeEmojiGuessGames[getChatKey(chatId)];
}

function clearEmojiGuess(chatId) {
  delete activeEmojiGuessGames[getChatKey(chatId)];
}

function startHangman(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeHangmanGames[getChatKey(chatId)] = {
    word: item.word,
    hint: item.hint,
    guessedLetters: new Set(),
    wrongLetters: new Set(),
    maxWrong: 6,
    ownerUserId: user.id,
    ownerUserName: getUserName(user)
  };
  return activeHangmanGames[getChatKey(chatId)];
}

function clearHangman(chatId) {
  delete activeHangmanGames[getChatKey(chatId)];
}

function getHangmanStateText(game) {
  return `🎯 Виселица\n\nСлово: ${formatMaskedWord(game.word, game.guessedLetters)}\nОшибки: ${game.wrongLetters.size}/${game.maxWrong}\nБуквы: ${game.wrongLetters.size ? [...game.wrongLetters].join(", ") : "нет"}`;
}

function isValidPvpWord(word) {
  const raw = String(word || "").trim();
  if (!raw || raw.startsWith("/")) return null;
  if (!/^[a-zа-яёіїєґ]+$/i.test(raw)) return null;
  const normalized = normalizeText(raw);
  if (normalized.length < 3 || normalized.length > 12) return null;
  return normalized;
}

function formatPvpState(game) {
  return `🎯 Виселица ПВП\nЗагадывает: ${getUserName(game.ownerUser)}\nУгадывает: ${getUserName(game.guesserUser)}\n\nСлово: ${formatMaskedWord(game.word, game.guessedLetters)}\nОшибки: ${game.wrongLetters.size}/6\nБуквы: ${game.allLetters.size ? [...game.allLetters].join(", ") : "нет"}`;
}

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const lowerText = normalizeText(text);

  if (msg.chat.type === "private") {
    for (const key of Object.keys(activeHangmanPvPGames)) {
      const game = activeHangmanPvPGames[key];
      if (game.stage === "waiting_word" && game.ownerUser.id === msg.from.id) {
        const validWord = isValidPvpWord(text);
        if (!validWord) {
          await safeSendMessage(chatId, "❌ Напиши слово только буквами, без цифр и символов.");
          return;
        }

        game.word = validWord;
        game.stage = "active";
        game.guessedLetters = new Set();
        game.wrongLetters = new Set();
        game.allLetters = new Set();

        await safeSendMessage(chatId, "✅ Слово принято.");
        await safeSendMessage(
          game.chatId,
          `🎮 Слово загадано!\n\n${getUserLink(game.ownerUser)} загадал(а) слово.\n${getUserLink(game.guesserUser)}, угадывай!\n\n${formatPvpState(game)}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
        return;
      }
    }
  }

  const pvp = activeHangmanPvPGames[getChatKey(chatId)];
  if (pvp) {
    if (lowerText === "отмена" && msg.from.id === pvp.ownerUser.id) {
      delete activeHangmanPvPGames[getChatKey(chatId)];
      await safeSendMessage(chatId, "❌ Игра в виселицу ПВП отменена.");
      return;
    }

    if (pvp.stage === "waiting_player" && lowerText === "играю") {
      if (msg.from.id === pvp.ownerUser.id) {
        await safeSendMessage(chatId, "❌ Нельзя играть против самого себя.");
        return;
      }

      pvp.guesserUser = msg.from;
      pvp.stage = "waiting_word";

      await safeSendMessage(
        chatId,
        `✅ Игрок найден!\n\nЗагадывает слово: ${getUserLink(pvp.ownerUser)}\nУгадывает слово: ${getUserLink(pvp.guesserUser)}\n\n${getUserLink(pvp.ownerUser)}, отправь слово мне в личку.`,
        { parse_mode: "HTML", disable_web_page_preview: true }
      );
      return;
    }

    if (pvp.stage === "active" && msg.from.id === pvp.guesserUser.id) {
      const answer = normalizeText(text);
      if (!/^[a-zа-яёіїєґ]+$/i.test(answer)) return;

      if (answer.length === 1) {
        if (pvp.allLetters.has(answer)) {
          await safeSendMessage(chatId, `⚠️ Буква "${answer}" уже была.`);
          return;
        }

        pvp.allLetters.add(answer);

        if (pvp.word.includes(answer)) {
          pvp.guessedLetters.add(answer);

          const fullyGuessed = pvp.word.split("").every(ch => pvp.guessedLetters.has(ch));
          if (fullyGuessed) {
            await safeSendMessage(chatId, `🏆 Победа!\n${getUserLink(pvp.guesserUser)} угадал(а) слово: ${escapeHtml(pvp.word)}`, {
              parse_mode: "HTML",
              disable_web_page_preview: true
            });
            delete activeHangmanPvPGames[getChatKey(chatId)];
            return;
          }

          await safeSendMessage(chatId, `✅ Буква "${answer}" есть!\n\n${formatPvpState(pvp)}`);
          return;
        }

        pvp.wrongLetters.add(answer);
        if (pvp.wrongLetters.size >= 6) {
          await safeSendMessage(chatId, `💀 Игра окончена!\n${getUserLink(pvp.guesserUser)} не смог(ла) угадать слово.\nЗагаданное слово: ${escapeHtml(pvp.word)}`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          delete activeHangmanPvPGames[getChatKey(chatId)];
          return;
        }

        await safeSendMessage(chatId, `❌ Буквы "${answer}" нет!\n\n${formatPvpState(pvp)}`);
        return;
      }

      if (answer.length > 1) {
        if (answer === pvp.word) {
          await safeSendMessage(chatId, `🏆 Победа!\n${getUserLink(pvp.guesserUser)} угадал(а) слово: ${escapeHtml(pvp.word)}`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          delete activeHangmanPvPGames[getChatKey(chatId)];
          return;
        }

        pvp.wrongLetters.add(`слово:${answer}`);
        if (pvp.wrongLetters.size >= 6) {
          await safeSendMessage(chatId, `💀 Игра окончена!\n${getUserLink(pvp.guesserUser)} не смог(ла) угадать слово.\nЗагаданное слово: ${escapeHtml(pvp.word)}`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
          delete activeHangmanPvPGames[getChatKey(chatId)];
          return;
        }

        await safeSendMessage(chatId, `❌ Это не то слово!\n\n${formatPvpState(pvp)}`);
        return;
      }
    }
  }

  if (/^\/start(@[a-z0-9_]+)?$/i.test(text)) {
    await safeSendMessage(
      chatId,
      `🔥 Привет, ${getUserName(msg.from)}!\n\nЯ Мини Модератор для Telegram-групп.\nНапиши /help, чтобы получить ссылку на список команд.`
    );
    return;
  }

  if (/^\/help(@[a-z0-9_]+)?$/i.test(text)) {
    await safeSendMessage(
      chatId,
      `📘 Ссылка на список команд бота:\n${HELP_ARTICLE_URL}`
    );
    return;
  }

  if (lowerText === "бомба") {
    activeBombs[getChatKey(chatId)] = { holder: msg.from };
    await safeSendMessage(chatId, `💣 Бомба активирована!\nДержит: ${getUserLink(msg.from)}\n\nЧтобы передать, напиши: передать`, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    return;
  }

  if (lowerText === "передать") {
    const bomb = activeBombs[getChatKey(chatId)];
    if (!bomb) {
      await safeSendMessage(chatId, "❌ Сейчас нет активной бомбы.");
      return;
    }

    bomb.holder = msg.from;
    await safeSendMessage(chatId, `💣 Бомба передана!\nТеперь держит: ${getUserLink(msg.from)}`, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    return;
  }

  if (lowerText === "пара") {
    await safeSendMessage(chatId, `💘 Пара дня: ${getUserName(msg.from)} + ${getRandomFromArray(["пицца", "сон", "мемы", "удача", "кофе"])} 😄`);
    return;
  }

  if (lowerText.startsWith("кто ")) {
    await safeSendMessage(chatId, `👀 Мне кажется, это ${getUserName(msg.from)}.`);
    return;
  }

  if (lowerText === "оценка") {
    await safeSendMessage(chatId, `📊 Оценка: ${Math.floor(Math.random() * 10) + 1}/10`);
    return;
  }

  if (lowerText === "прогноз") {
    await safeSendMessage(chatId, `🔮 Прогноз: ${getRandomFromArray([
      "Сегодня тебе повезёт 😎",
      "Будь осторожен сегодня 😬",
      "Тебя ждёт сюрприз 🎁",
      "Сегодня твой день 🔥",
      "Лучше отдохни 😴"
    ])}`);
    return;
  }

  if (lowerText === "он врет?") {
    const percent = Math.floor(Math.random() * 101);
    let result = "✅ Скорее говорит правду";
    if (percent >= 85) result = "💀 100% врёт";
    else if (percent >= 65) result = "🤥 Похоже, он врёт";
    else if (percent >= 45) result = "😐 Не могу понять";
    await safeSendMessage(chatId, `🕵️ Проверка лжи: ${percent}%\n${result}`);
    return;
  }

  if (lowerText === "голосование") {
    await safeSendMessage(chatId, "🗳 Голосование создано!\nПиши в чат:\n• да\n• нет");
    return;
  }

  if (lowerText === "угадай слово") {
    const existing = activeGuessWordGames[getChatKey(chatId)];
    if (existing) {
      await safeSendMessage(chatId, `❌ Игра уже идёт.\nСейчас играет: ${existing.ownerUserName}`);
      return;
    }

    const game = startGuessWord(chatId, msg.from);
    await safeSendMessage(chatId, `🎯 Угадай слово!\nИгрок: ${game.ownerUserName}\n\nЧтобы получить подсказку, напиши в чат: подсказка`);
    return;
  }

  if (lowerText === "угадай число") {
    const existing = activeGuessNumberGames[getChatKey(chatId)];
    if (existing) {
      await safeSendMessage(chatId, `❌ Игра уже идёт.\nСейчас играет: ${existing.ownerUserName}`);
      return;
    }

    const game = startGuessNumber(chatId, msg.from);
    await safeSendMessage(chatId, `🔢 Я загадал число от 1 до 20.\nИгрок: ${game.ownerUserName}\nУгадай!`);
    return;
  }

  if (lowerText === "угадай по эмодзи") {
    const existing = activeEmojiGuessGames[getChatKey(chatId)];
    if (existing) {
      await safeSendMessage(chatId, `❌ Игра уже идёт.\nСейчас играет: ${existing.ownerUserName}`);
      return;
    }

    const game = startEmojiGuess(chatId, msg.from);
    await safeSendMessage(chatId, `😀 Угадай слово по эмодзи:\n${game.emojis}\n\nИгрок: ${game.ownerUserName}`);
    return;
  }

  if (lowerText === "виселица") {
    const existing = activeHangmanGames[getChatKey(chatId)];
    if (existing) {
      await safeSendMessage(chatId, `❌ Игра уже идёт.\nСейчас играет: ${existing.ownerUserName}`);
      return;
    }

    const game = startHangman(chatId, msg.from);
    await safeSendMessage(chatId, `👤 Игрок: ${game.ownerUserName}\n\n${getHangmanStateText(game)}\n\nЧтобы получить подсказку, напиши в чат: подсказка`);
    return;
  }

  if (lowerText === "подсказка") {
    const wordGame = activeGuessWordGames[getChatKey(chatId)];
    if (wordGame) {
      await safeSendMessage(chatId, `💡 Подсказка: ${wordGame.hint}`);
      return;
    }

    const hangmanGame = activeHangmanGames[getChatKey(chatId)];
    if (hangmanGame) {
      await safeSendMessage(chatId, `💡 Подсказка: ${hangmanGame.hint}`);
      return;
    }

    return;
  }

  if (lowerText === "я сдаюсь") {
    const wordGame = activeGuessWordGames[getChatKey(chatId)];
    if (wordGame && msg.from.id === wordGame.ownerUserId) {
      await safeSendMessage(chatId, `😢 Ты сдался.\nСлово было: ${wordGame.word}`);
      clearGuessWord(chatId);
      return;
    }

    const emojiGame = activeEmojiGuessGames[getChatKey(chatId)];
    if (emojiGame && msg.from.id === emojiGame.ownerUserId) {
      await safeSendMessage(chatId, `😢 Ты сдался.\nСлово было: ${emojiGame.word}`);
      clearEmojiGuess(chatId);
      return;
    }

    const hangmanGame = activeHangmanGames[getChatKey(chatId)];
    if (hangmanGame && msg.from.id === hangmanGame.ownerUserId) {
      await safeSendMessage(chatId, `😢 Ты сдался.\nСлово было: ${hangmanGame.word}`);
      clearHangman(chatId);
      return;
    }

    return;
  }

  if (lowerText === "правда или действие") {
    await safeSendMessage(chatId, "🎭 Правда или действие?\nНапиши:\n• правда\n• действие");
    return;
  }

  if (lowerText === "правда") {
    await safeSendMessage(chatId, `😈 Правда:\n${getRandomFromArray(TRUTH_QUESTIONS)}`);
    return;
  }

  if (lowerText === "действие") {
    await safeSendMessage(chatId, `🔥 Действие:\n${getRandomFromArray(DARE_TASKS)}`);
    return;
  }

  if (lowerText.startsWith("насколько ты")) {
    await safeSendMessage(chatId, `📊 ${Math.floor(Math.random() * 101)}%`);
    return;
  }

  if (lowerText === "кем ты был бы") {
    await safeSendMessage(chatId, `🌀 Ты был(а) бы ${getRandomFromArray(WOULD_BE_VARIANTS)}`);
    return;
  }

  if (lowerText === "виселица пвп" || lowerText === "виселицапвп" || /^\/виселицапвп(@[a-z0-9_]+)?$/i.test(text)) {
    activeHangmanPvPGames[getChatKey(chatId)] = {
      chatId,
      ownerUser: msg.from,
      guesserUser: null,
      stage: "waiting_player",
      word: null,
      guessedLetters: new Set(),
      wrongLetters: new Set(),
      allLetters: new Set()
    };

    await safeSendMessage(
      chatId,
      `🎯 Виселица ПВП создана!\nСоздатель игры: ${getUserLink(msg.from)}\n\nКто хочет играть — напиши:\nиграю\n\nЧтобы отменить игру, создатель может написать:\nотмена`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
    return;
  }

  const guessWordGame = activeGuessWordGames[getChatKey(chatId)];
  if (
    guessWordGame &&
    msg.from.id === guessWordGame.ownerUserId &&
    lowerText === normalizeText(guessWordGame.word)
  ) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${guessWordGame.word}`);
    clearGuessWord(chatId);
    return;
  }

  const guessNumberGame = activeGuessNumberGames[getChatKey(chatId)];
  if (
    guessNumberGame &&
    msg.from.id === guessNumberGame.ownerUserId &&
    /^\d+$/.test(lowerText)
  ) {
    const num = Number(lowerText);
    if (num === guessNumberGame.target) {
      await safeSendMessage(chatId, `🏆 Правильно! Я загадал число ${guessNumberGame.target}`);
      clearGuessNumber(chatId);
    } else if (num < guessNumberGame.target) {
      await safeSendMessage(chatId, "📈 Больше!");
    } else {
      await safeSendMessage(chatId, "📉 Меньше!");
    }
    return;
  }

  const emojiGame = activeEmojiGuessGames[getChatKey(chatId)];
  if (
    emojiGame &&
    msg.from.id === emojiGame.ownerUserId &&
    lowerText === normalizeText(emojiGame.word)
  ) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${emojiGame.word}`);
    clearEmojiGuess(chatId);
    return;
  }

  const hangmanGame = activeHangmanGames[getChatKey(chatId)];
  if (
    hangmanGame &&
    msg.from.id === hangmanGame.ownerUserId &&
    /^[a-zа-яёіїєґ]+$/i.test(text)
  ) {
    const answer = normalizeText(text);

    if (answer.length === 1) {
      if (hangmanGame.guessedLetters.has(answer) || hangmanGame.wrongLetters.has(answer)) {
        await safeSendMessage(chatId, "⚠️ Эта буква уже была.");
        return;
      }

      if (hangmanGame.word.includes(answer)) {
        hangmanGame.guessedLetters.add(answer);
        const done = hangmanGame.word.split("").every(ch => hangmanGame.guessedLetters.has(ch));
        if (done) {
          await safeSendMessage(chatId, `🏆 Ты выиграл!\nСлово: ${hangmanGame.word}`);
          clearHangman(chatId);
          return;
        }

        await safeSendMessage(chatId, `✅ Есть такая буква!\n\n${getHangmanStateText(hangmanGame)}`);
        return;
      }

      hangmanGame.wrongLetters.add(answer);
      if (hangmanGame.wrongLetters.size >= hangmanGame.maxWrong) {
        await safeSendMessage(chatId, `💀 Ты проиграл.\nСлово было: ${hangmanGame.word}`);
        clearHangman(chatId);
        return;
      }

      await safeSendMessage(chatId, `❌ Такой буквы нет.\n\n${getHangmanStateText(hangmanGame)}`);
      return;
    }

    if (answer === hangmanGame.word) {
      await safeSendMessage(chatId, `🏆 Ты выиграл!\nСлово: ${hangmanGame.word}`);
      clearHangman(chatId);
      return;
    }

    hangmanGame.wrongLetters.add(answer);
    if (hangmanGame.wrongLetters.size >= hangmanGame.maxWrong) {
      await safeSendMessage(chatId, `💀 Ты проиграл.\nСлово было: ${hangmanGame.word}`);
      clearHangman(chatId);
      return;
    }

    await safeSendMessage(chatId, `❌ Это не то слово.\n\n${getHangmanStateText(hangmanGame)}`);
    return;
  }
});

console.log("Games-only bot started");
