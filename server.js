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

const HELP_ARTICLE_URL = "https://teletype.in/@mini_moderator/KBilsLxWXpV";

const activeBombs = {};
const activeGuessWordGames = {};
const activeGuessNumberGames = {};
const activeEmojiGuessGames = {};
const activeHangmanGames = {};
const activeHangmanPvPGames = {};
const activeAnagramGames = {};
const activeReverseWordGames = {};
const activeMathGames = {};
const activeQuizGames = {};
const activeOddOneGames = {};
const activeCapitalGames = {};
const activeCipherGames = {};
const activeReactionGames = {};
const recentActiveUsers = {};

const RECENT_ACTIVE_MS = 15 * 60 * 1000;
const BOMB_TIMER_MS = 5000;

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

const FORTUNE_BALL_ANSWERS = [
  "Да ✅",
  "Нет ❌",
  "Скорее да 😏",
  "Скорее нет 🤨",
  "Возможно 🤔",
  "Спроси позже ⏳",
  "Сегодня тебе повезёт 🍀",
  "Не рискуй 😬",
  "Однозначно да 🔥",
  "Очень сомнительно 🫠"
];

const RANDOM_FACTS = [
  "У осьминога три сердца. ❤️",
  "Мёд никогда не портится. 🍯",
  "Бананы — это ягоды, а клубника — нет. 🍌",
  "Улитки могут спать до трёх лет. 🐌",
  "У акул нет костей. 🦈",
  "Коровы могут иметь лучших друзей. 🐄",
  "У жирафа язык может быть длиной до 50 см. 🦒",
  "У пчёл пять глаз. 🐝",
  "Луна отдаляется от Земли каждый год. 🌕",
  "Дельфины дают друг другу имена. 🐬"
];

const QUIZ_ITEMS = [
  { question: "Сколько дней в неделе?", options: ["5", "6", "7", "8"], correctIndex: 2 },
  { question: "Какого цвета небо в ясную погоду?", options: ["Синее", "Зелёное", "Чёрное", "Оранжевое"], correctIndex: 0 },
  { question: "Сколько будет 2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1 },
  { question: "Какое животное говорит «мяу»?", options: ["Собака", "Кошка", "Корова", "Лошадь"], correctIndex: 1 },
  { question: "Что светит ночью на небе?", options: ["Солнце", "Луна", "Радуга", "Облако"], correctIndex: 1 }
];

const ODD_ONE_ITEMS = [
  { options: ["яблоко", "банан", "машина", "груша"], correctIndex: 2, explanation: "машина — не фрукт" },
  { options: ["стол", "стул", "диван", "лимон"], correctIndex: 3, explanation: "лимон — не мебель" },
  { options: ["кот", "собака", "поезд", "хомяк"], correctIndex: 2, explanation: "поезд — не животное" },
  { options: ["красный", "синий", "арбуз", "зелёный"], correctIndex: 2, explanation: "арбуз — не цвет" }
];

const CAPITAL_ITEMS = [
  { country: "Украина", capital: "киев" },
  { country: "Франция", capital: "париж" },
  { country: "Германия", capital: "берлин" },
  { country: "Италия", capital: "рим" },
  { country: "Испания", capital: "мадрид" },
  { country: "Япония", capital: "токио" }
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
  { word: "самолет", hint: "летает в небе" },
  { word: "ложка", hint: "ею едят суп" },
  { word: "молоко", hint: "белый напиток" },
  { word: "радуга", hint: "видна после дождя" },
  { word: "медведь", hint: "большой лесной зверь" }
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
  return user.id ? `ID ${user.id}` : "Пользователь";
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

function shuffleWord(word) {
  const arr = word.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const shuffled = arr.join("");
  if (shuffled === word && arr.length > 1) return shuffleWord(word);
  return shuffled;
}

function reverseWord(word) {
  return word.split("").reverse().join("");
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

function touchActiveUser(chatId, user) {
  if (!user || !user.id || user.is_bot) return;
  const key = getChatKey(chatId);
  if (!recentActiveUsers[key]) recentActiveUsers[key] = {};
  recentActiveUsers[key][String(user.id)] = {
    user: {
      id: user.id,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      username: user.username || ""
    },
    lastSeen: Date.now()
  };
}

function getActiveUsers(chatId) {
  const key = getChatKey(chatId);
  const store = recentActiveUsers[key] || {};
  const now = Date.now();
  return Object.values(store)
    .filter(entry => now - entry.lastSeen <= RECENT_ACTIVE_MS)
    .map(entry => entry.user);
}

function getRandomActiveUser(chatId, excludedUserIds = []) {
  const excluded = new Set(excludedUserIds.map(id => Number(id)));
  const candidates = getActiveUsers(chatId).filter(user => !excluded.has(Number(user.id)));
  if (!candidates.length) return null;
  return getRandomFromArray(candidates);
}

function getTwoRandomActiveUsers(chatId) {
  const users = getActiveUsers(chatId);
  if (users.length < 2) return null;
  const first = getRandomFromArray(users);
  const secondPool = users.filter(u => Number(u.id) !== Number(first.id));
  if (!secondPool.length) return null;
  const second = getRandomFromArray(secondPool);
  return [first, second];
}

function clearBombTimer(chatId) {
  const key = getChatKey(chatId);
  const bomb = activeBombs[key];
  if (bomb && bomb.timer) {
    clearTimeout(bomb.timer);
    bomb.timer = null;
  }
}

async function explodeBomb(chatId) {
  const key = getChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return;
  const holder = bomb.holderUser;
  delete activeBombs[key];
  await safeSendMessage(
    chatId,
    `💥 Бомба взорвалась у ${getUserLink(holder)}!`,
    { parse_mode: "HTML", disable_web_page_preview: true }
  );
}

function scheduleBomb(chatId) {
  const key = getChatKey(chatId);
  const bomb = activeBombs[key];
  if (!bomb) return;
  clearBombTimer(chatId);
  bomb.expiresAt = Date.now() + BOMB_TIMER_MS;
  bomb.timer = setTimeout(() => {
    explodeBomb(chatId).catch(err => console.error(err));
  }, BOMB_TIMER_MS);
}

async function setBombHolder(chatId, user, introText = "💣 Бомба у") {
  const key = getChatKey(chatId);
  if (!activeBombs[key]) activeBombs[key] = {};
  activeBombs[key].holderUser = user;
  scheduleBomb(chatId);
  await safeSendMessage(
    chatId,
    `${introText} ${getUserLink(user)}!\n⏳ Осталось 5 сек.\n\nЧтобы передать, держатель должен написать: передать`,
    { parse_mode: "HTML", disable_web_page_preview: true }
  );
}

function clearGuessWord(chatId) { delete activeGuessWordGames[getChatKey(chatId)]; }
function clearGuessNumber(chatId) { delete activeGuessNumberGames[getChatKey(chatId)]; }
function clearEmojiGuess(chatId) { delete activeEmojiGuessGames[getChatKey(chatId)]; }
function clearHangman(chatId) { delete activeHangmanGames[getChatKey(chatId)]; }
function clearAnagram(chatId) { delete activeAnagramGames[getChatKey(chatId)]; }
function clearReverseWord(chatId) { delete activeReverseWordGames[getChatKey(chatId)]; }
function clearMathGame(chatId) { delete activeMathGames[getChatKey(chatId)]; }
function clearQuizGame(chatId) { delete activeQuizGames[getChatKey(chatId)]; }
function clearOddOneGame(chatId) { delete activeOddOneGames[getChatKey(chatId)]; }
function clearCapitalGame(chatId) { delete activeCapitalGames[getChatKey(chatId)]; }
function clearCipherGame(chatId) { delete activeCipherGames[getChatKey(chatId)]; }
function clearReactionGame(chatId) { delete activeReactionGames[getChatKey(chatId)]; }

function startQuizGame(chatId, user) {
  const item = getRandomFromArray(QUIZ_ITEMS);
  activeQuizGames[getChatKey(chatId)] = {
    ...item,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeQuizGames[getChatKey(chatId)];
}

function startOddOneGame(chatId, user) {
  const item = getRandomFromArray(ODD_ONE_ITEMS);
  activeOddOneGames[getChatKey(chatId)] = {
    ...item,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeOddOneGames[getChatKey(chatId)];
}

function startCapitalGame(chatId, user) {
  const item = getRandomFromArray(CAPITAL_ITEMS);
  activeCapitalGames[getChatKey(chatId)] = {
    ...item,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeCapitalGames[getChatKey(chatId)];
}

function startCipherGame(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  const word = normalizeText(item.word);
  const shifted = word.split("").map(ch => String.fromCharCode(ch.charCodeAt(0) + 1)).join("");
  activeCipherGames[getChatKey(chatId)] = {
    word,
    cipher: shifted,
    hint: item.hint,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeCipherGames[getChatKey(chatId)];
}

function startReactionGame(chatId, user) {
  const target = getRandomFromArray(["молния", "ракета", "огонь", "победа"]);
  activeReactionGames[getChatKey(chatId)] = {
    target,
    startedByUserId: user.id,
    startedByUserName: getUserName(user),
    startedAt: Date.now()
  };
  return activeReactionGames[getChatKey(chatId)];
}


function startGuessWord(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeGuessWordGames[getChatKey(chatId)] = {
    ...item,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeGuessWordGames[getChatKey(chatId)];
}

function startGuessNumber(chatId, user) {
  const target = Math.floor(Math.random() * 20) + 1;
  activeGuessNumberGames[getChatKey(chatId)] = {
    target,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeGuessNumberGames[getChatKey(chatId)];
}

function startEmojiGuess(chatId, user) {
  const item = getRandomFromArray(EMOJI_GUESS_ITEMS);
  activeEmojiGuessGames[getChatKey(chatId)] = {
    ...item,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeEmojiGuessGames[getChatKey(chatId)];
}

function startHangman(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeHangmanGames[getChatKey(chatId)] = {
    word: item.word,
    hint: item.hint,
    guessedLetters: new Set(),
    wrongLetters: new Set(),
    maxWrong: 6,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeHangmanGames[getChatKey(chatId)];
}

function startAnagram(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeAnagramGames[getChatKey(chatId)] = {
    word: item.word,
    shuffled: shuffleWord(item.word),
    hint: item.hint,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeAnagramGames[getChatKey(chatId)];
}

function startReverseWord(chatId, user) {
  const item = getRandomFromArray(GUESS_WORD_ITEMS);
  activeReverseWordGames[getChatKey(chatId)] = {
    word: item.word,
    reversed: reverseWord(item.word),
    hint: item.hint,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeReverseWordGames[getChatKey(chatId)];
}

function startMathGame(chatId, user) {
  const a = Math.floor(Math.random() * 16) + 5;
  const b = Math.floor(Math.random() * 16) + 2;
  const op = getRandomFromArray(["+", "-", "*"]);
  let answer = 0;
  if (op === "+") answer = a + b;
  if (op === "-") answer = a - b;
  if (op === "*") answer = a * b;

  activeMathGames[getChatKey(chatId)] = {
    a, b, op, answer,
    startedByUserId: user.id,
    startedByUserName: getUserName(user)
  };
  return activeMathGames[getChatKey(chatId)];
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

function clearAllGames(chatId) {
  const key = getChatKey(chatId);
  clearBombTimer(chatId);
  delete activeBombs[key];
  delete activeGuessWordGames[key];
  delete activeGuessNumberGames[key];
  delete activeEmojiGuessGames[key];
  delete activeHangmanGames[key];
  delete activeHangmanPvPGames[key];
  delete activeAnagramGames[key];
  delete activeReverseWordGames[key];
  delete activeMathGames[key];
  delete activeQuizGames[key];
  delete activeOddOneGames[key];
  delete activeCapitalGames[key];
  delete activeCipherGames[key];
  delete activeReactionGames[key];
}

function getActiveGameName(chatId) {
  const key = getChatKey(chatId);
  if (activeBombs[key]) return "бомба";
  if (activeGuessWordGames[key]) return "угадай слово";
  if (activeGuessNumberGames[key]) return "угадай число";
  if (activeEmojiGuessGames[key]) return "угадай по эмодзи";
  if (activeHangmanGames[key]) return "виселица";
  if (activeHangmanPvPGames[key]) return "виселица пвп";
  if (activeAnagramGames[key]) return "анаграмма";
  if (activeReverseWordGames[key]) return "слово наоборот";
  if (activeMathGames[key]) return "математика";
  if (activeQuizGames[key]) return "викторина";
  if (activeOddOneGames[key]) return "лишнее";
  if (activeCapitalGames[key]) return "угадай столицу";
  if (activeCipherGames[key]) return "шифр";
  if (activeReactionGames[key]) return "реакция";
  return null;
}

function getRulesText(chatId) {
  const key = getChatKey(chatId);

  if (activeBombs[key]) return "💣 Правила игры «Бомба»:\nБомба даётся случайному активному игроку.\nУ него есть 5 секунд, чтобы написать: передать\nПосле передачи бомба уходит другому активному игроку и таймер начинается заново.";
  if (activeGuessWordGames[key]) return "🎯 Правила игры «Угадай слово»:\nПиши варианты слова в чат.\nЧтобы получить помощь, напиши: подсказка\nЧтобы сдаться, напиши: я сдаюсь";
  if (activeGuessNumberGames[key]) return "🔢 Правила игры «Угадай число»:\nНужно угадать число от 1 до 20.\nБот подскажет: больше или меньше.";
  if (activeEmojiGuessGames[key]) return "😀 Правила игры «Угадай по эмодзи»:\nСмотри на эмодзи и пиши слово в чат.\nЧтобы сдаться, напиши: я сдаюсь";
  if (activeHangmanGames[key]) return "🎯 Правила игры «Виселица»:\nПиши по одной букве или сразу всё слово.\nЧтобы получить помощь, напиши: подсказка\nЧтобы сдаться, напиши: я сдаюсь";
  if (activeHangmanPvPGames[key]) return "⚔️ Правила игры «Виселица ПВП»:\nОдин игрок загадывает слово, другой угадывает.\nКоманды: играю, отмена.\nЕсли угадывающий напишет: я сдаюсь — бот покажет правильный ответ.";
  if (activeAnagramGames[key]) return "🔀 Правила игры «Анаграмма»:\nБот присылает перемешанное слово.\nНужно угадать исходное слово.\nЧтобы получить помощь, напиши: подсказка";
  if (activeQuizGames[key]) return "📚 Правила игры «Викторина»:\nНапиши: ответ 1, ответ 2, ответ 3 или ответ 4";
  if (activeOddOneGames[key]) return "🧩 Правила игры «Лишнее»:\nВыбери лишнее слово командой: вариант 1, вариант 2, вариант 3 или вариант 4";
  if (activeCapitalGames[key]) return "🌍 Правила игры «Угадай столицу»:\nНапиши столицу страны в чат.";
  if (activeCipherGames[key]) return "🔐 Правила игры «Шифр»:\nБот пишет зашифрованное слово. Нужно угадать исходное слово.\nЧтобы получить помощь, напиши: подсказка";
  if (activeReactionGames[key]) return "⚡ Правила игры «Реакция»:\nКто первым напишет нужное слово — тот победил.";
  if (activeReverseWordGames[key]) return "↩️ Правила игры «Слово наоборот»:\nБот пишет слово наоборот.\nНужно угадать нормальное слово.\nЧтобы получить помощь, напиши: подсказка";
  if (activeMathGames[key]) return "🧮 Правила игры «Математика»:\nРеши пример и напиши ответ в чат.";

  return "❌ Сейчас в этом чате нет активной игры.";
}

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const lowerText = normalizeText(text);

  touchActiveUser(chatId, msg.from);

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
      if (lowerText === "я сдаюсь" || lowerText === "сдаться") {
        await safeSendMessage(
          chatId,
          `😢 ${getUserLink(pvp.guesserUser)} сдался(ась).\nПравильный ответ: ${escapeHtml(pvp.word)}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
        delete activeHangmanPvPGames[getChatKey(chatId)];
        return;
      }

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
            await safeSendMessage(
              chatId,
              `🏆 Победа!\n${getUserLink(pvp.guesserUser)} угадал(а) слово: ${escapeHtml(pvp.word)}`,
              { parse_mode: "HTML", disable_web_page_preview: true }
            );
            delete activeHangmanPvPGames[getChatKey(chatId)];
            return;
          }

          await safeSendMessage(chatId, `✅ Буква "${answer}" есть!\n\n${formatPvpState(pvp)}`);
          return;
        }

        pvp.wrongLetters.add(answer);
        if (pvp.wrongLetters.size >= 6) {
          await safeSendMessage(
            chatId,
            `💀 Игра окончена!\n${getUserLink(pvp.guesserUser)} не смог(ла) угадать слово.\nЗагаданное слово: ${escapeHtml(pvp.word)}`,
            { parse_mode: "HTML", disable_web_page_preview: true }
          );
          delete activeHangmanPvPGames[getChatKey(chatId)];
          return;
        }

        await safeSendMessage(chatId, `❌ Буквы "${answer}" нет!\n\n${formatPvpState(pvp)}`);
        return;
      }

      if (answer === pvp.word) {
        await safeSendMessage(
          chatId,
          `🏆 Победа!\n${getUserLink(pvp.guesserUser)} угадал(а) слово: ${escapeHtml(pvp.word)}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
        delete activeHangmanPvPGames[getChatKey(chatId)];
        return;
      }

      pvp.wrongLetters.add(`слово:${answer}`);
      if (pvp.wrongLetters.size >= 6) {
        await safeSendMessage(
          chatId,
          `💀 Игра окончена!\n${getUserLink(pvp.guesserUser)} не смог(ла) угадать слово.\nЗагаданное слово: ${escapeHtml(pvp.word)}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
        delete activeHangmanPvPGames[getChatKey(chatId)];
        return;
      }

      await safeSendMessage(chatId, `❌ Это не то слово!\n\n${formatPvpState(pvp)}`);
      return;
    }
  }

  if (/^\/start(@[a-z0-9_]+)?$/i.test(text)) {
    await safeSendMessage(
      chatId,
      `🔥 Привет, ${getUserName(msg.from)}!\n\nЯ Мини Модер для Telegram-групп.\nНапиши /help, чтобы получить ссылку на список команд.`
    );
    return;
  }

  if (/^\/help(@[a-z0-9_]+)?$/i.test(text)) {
    await safeSendMessage(chatId, `📘 Ссылка на список команд бота:\n${HELP_ARTICLE_URL}`);
    return;
  }

  if (lowerText === "стоп" || lowerText === "отмена игры") {
    const activeGame = getActiveGameName(chatId);
    if (!activeGame) {
      await safeSendMessage(chatId, "❌ В этом чате сейчас нет активной игры.");
      return;
    }

    clearAllGames(chatId);
    await safeSendMessage(chatId, `🛑 Игра остановлена: ${activeGame}`);
    return;
  }

  if (lowerText === "правила") {
    await safeSendMessage(chatId, getRulesText(chatId));
    return;
  }

  if (lowerText === "монетка") {
    const result = Math.random() < 0.5 ? "Орёл 🦅" : "Решка 🪙";
    await safeSendMessage(chatId, `🪙 Монетка: ${result}`);
    return;
  }

  if (lowerText === "кубик") {
    const roll = Math.floor(Math.random() * 6) + 1;
    await safeSendMessage(chatId, `🎲 Выпало: ${roll}`);
    return;
  }

  if (lowerText === "рулетка") {
    const result = getRandomFromArray([
      "🔴 Пусто. Сегодня не повезло.",
      "🟢 Повезло! Ты победил удачу.",
      "⚫ Опасный результат... но ты выжил.",
      "🎁 Джекпот настроения!",
      "💀 Почти проиграл всё.",
      "🍀 Сегодня фортуна на твоей стороне."
    ]);
    await safeSendMessage(chatId, `🎰 Рулетка:\n${result}`);
    return;
  }

  if (lowerText === "да или нет") {
    await safeSendMessage(chatId, `❓ Ответ:\n${getRandomFromArray([
      "Да ✅",
      "Нет ❌",
      "Скорее да 😏",
      "Скорее нет 🤨",
      "Возможно 🤔"
    ])}`);
    return;
  }

  if (lowerText === "шар судьбы") {
    await safeSendMessage(chatId, `🔮 Шар судьбы:\n${getRandomFromArray(FORTUNE_BALL_ANSWERS)}`);
    return;
  }

  if (lowerText === "случайный факт") {
    await safeSendMessage(chatId, `📚 Факт:\n${getRandomFromArray(RANDOM_FACTS)}`);
    return;
  }

  if (lowerText === "бомба") {
    const players = getActiveUsers(chatId);
    if (players.length < 2) {
      await safeSendMessage(chatId, "❌ Нет активных людей для игры в бомбу. Пусть кто-нибудь ещё напишет сообщение в чат.");
      return;
    }

    clearBombTimer(chatId);
    const holder = getRandomActiveUser(chatId);
    await setBombHolder(chatId, holder);
    return;
  }

  if (lowerText === "передать") {
    const bomb = activeBombs[getChatKey(chatId)];
    if (!bomb) {
      await safeSendMessage(chatId, "❌ Сейчас нет активной бомбы.");
      return;
    }

    if (Number(msg.from.id) !== Number(bomb.holderUser.id)) {
      await safeSendMessage(chatId, "❌ Передать бомбу может только тот, у кого она сейчас в руках.");
      return;
    }

    const nextHolder = getRandomActiveUser(chatId, [bomb.holderUser.id]);
    if (!nextHolder) {
      await safeSendMessage(chatId, "❌ Нет другого активного игрока, чтобы передать бомбу.");
      return;
    }

    await setBombHolder(chatId, nextHolder, "💣 Бомба теперь у");
    return;
  }

  if (lowerText === "пара") {
    const pair = getTwoRandomActiveUsers(chatId);
    if (!pair) {
      await safeSendMessage(chatId, "❌ Нужно хотя бы 2 активных человека в чате.");
      return;
    }

    await safeSendMessage(
      chatId,
      `💘 Пара дня:\n${getUserLink(pair[0])} + ${getUserLink(pair[1])}`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
    return;
  }

  if (lowerText.startsWith("кто ")) {
    const picked = getRandomActiveUser(chatId);
    if (!picked) {
      await safeSendMessage(chatId, "❌ Нет активных людей в чате, чтобы выбрать кого-то случайно.");
      return;
    }

    await safeSendMessage(
      chatId,
      `👀 Мне кажется, это ${getUserLink(picked)}.`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
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


  if (lowerText === "кнб камень" || lowerText === "кнб ножницы" || lowerText === "кнб бумага") {
    const userChoice = lowerText.split(" ")[1];
    const botChoice = getRandomFromArray(["камень", "ножницы", "бумага"]);
    let result = "🤝 Ничья!";
    if (
      (userChoice === "камень" && botChoice === "ножницы") ||
      (userChoice === "ножницы" && botChoice === "бумага") ||
      (userChoice === "бумага" && botChoice === "камень")
    ) {
      result = "🏆 Ты победил!";
    } else if (userChoice !== botChoice) {
      result = "💀 Бот победил!";
    }
    await safeSendMessage(chatId, `✊ КНБ\nТы: ${userChoice}\nБот: ${botChoice}\n\n${result}`);
    return;
  }

  
  if (["ударить","обнять","поцеловать","убить","пнуть"].includes(lowerText)) {
    const target = getRandomActiveUser(chatId, [msg.from.id]);

    if (!target) {
      await safeSendMessage(chatId, "❌ Нет другого игрока.");
      return;
    }

    const actions = {
      "ударить": "💥 ударил(а)",
      "обнять": "🤗 обнял(а)",
      "поцеловать": "😘 поцеловал(а)",
      "убить": "🔪 убил(а)",
      "пнуть": "🦵 пнул(а)"
    };

    await safeSendMessage(
      chatId,
      `${getUserLink(msg.from)} ${actions[lowerText]} ${getUserLink(target)}`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (lowerText === "викторина") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }
    const game = startQuizGame(chatId, msg.from);
    await safeSendMessage(
      chatId,
      `📚 Викторина!\nЗапустил(а): ${game.startedByUserName}\n\n${game.question}\n1) ${game.options[0]}\n2) ${game.options[1]}\n3) ${game.options[2]}\n4) ${game.options[3]}\n\nПиши: ответ 1`
    );
    return;
  }

  if (lowerText === "лишнее") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }
    const game = startOddOneGame(chatId, msg.from);
    await safeSendMessage(
      chatId,
      `🧩 Найди лишнее!\nЗапустил(а): ${game.startedByUserName}\n\n1) ${game.options[0]}\n2) ${game.options[1]}\n3) ${game.options[2]}\n4) ${game.options[3]}\n\nПиши: вариант 1`
    );
    return;
  }

  if (lowerText === "угадай столицу") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }
    const game = startCapitalGame(chatId, msg.from);
    await safeSendMessage(chatId, `🌍 Угадай столицу!\nЗапустил(а): ${game.startedByUserName}\n\nСтрана: ${game.country}`);
    return;
  }

  if (lowerText === "шифр") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }
    const game = startCipherGame(chatId, msg.from);
    await safeSendMessage(chatId, `🔐 Шифр!\nЗапустил(а): ${game.startedByUserName}\n\nСлово: ${game.cipher}`);
    return;
  }

  if (lowerText === "реакция") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }
    const game = startReactionGame(chatId, msg.from);
    await safeSendMessage(chatId, `⚡ Реакция!\nЗапустил(а): ${game.startedByUserName}\n\nКто первым напишет слово «${game.target}» — победил!`);
    return;
  }

  if (lowerText === "совместимость") {
    const pair = getTwoRandomActiveUsers(chatId);
    if (!pair) {
      await safeSendMessage(chatId, "❌ Нужно хотя бы 2 активных человека в чате.");
      return;
    }
    const percent = Math.floor(Math.random() * 101);
    await safeSendMessage(
      chatId,
      `💞 Совместимость:\n${getUserLink(pair[0])} + ${getUserLink(pair[1])}\n\n${percent}%`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
    return;
  }

  if (lowerText === "выбери") {
    const picked = getRandomActiveUser(chatId);
    if (!picked) {
      await safeSendMessage(chatId, "❌ Нет активных людей в чате.");
      return;
    }
    await safeSendMessage(
      chatId,
      `🎯 Я выбираю: ${getUserLink(picked)}`,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
    return;
  }

  if (lowerText === "удача") {
    await safeSendMessage(chatId, `🍀 Удача дня: ${Math.floor(Math.random() * 101)}%`);
    return;
  }

  if (lowerText === "настроение") {
    await safeSendMessage(chatId, `😊 Настроение: ${getRandomFromArray(["огонь 🔥", "спокойное 😌", "сонное 😴", "боевое 😎", "хаотичное 🤪"])}`);
    return;
  }

  if (lowerText === "угадай слово") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startGuessWord(chatId, msg.from);
    await safeSendMessage(chatId, `🎯 Угадай слово!\nЗапустил(а): ${game.startedByUserName}`);
    return;
  }

  if (lowerText === "угадай число") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startGuessNumber(chatId, msg.from);
    await safeSendMessage(chatId, `🔢 Я загадал число от 1 до 20.\nЗапустил(а): ${game.startedByUserName}\nУгадай!`);
    return;
  }

  if (lowerText === "угадай по эмодзи") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startEmojiGuess(chatId, msg.from);
    await safeSendMessage(chatId, `😀 Угадай слово по эмодзи:\n${game.emojis}\n\nЗапустил(а): ${game.startedByUserName}`);
    return;
  }

  if (lowerText === "виселица") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startHangman(chatId, msg.from);
    await safeSendMessage(chatId, `👤 Запустил(а): ${game.startedByUserName}\n\n${getHangmanStateText(game)}`);
    return;
  }

  if (lowerText === "анаграмма") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startAnagram(chatId, msg.from);
    await safeSendMessage(chatId, `🔀 Анаграмма!\nЗапустил(а): ${game.startedByUserName}\n\nСлово: ${game.shuffled}`);
    return;
  }

  if (lowerText === "слово наоборот") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startReverseWord(chatId, msg.from);
    await safeSendMessage(chatId, `↩️ Слово наоборот!\nЗапустил(а): ${game.startedByUserName}\n\nСлово: ${game.reversed}`);
    return;
  }

  if (lowerText === "математика") {
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

    const game = startMathGame(chatId, msg.from);
    await safeSendMessage(chatId, `🧮 Математика!\nЗапустил(а): ${game.startedByUserName}\n\nРеши: ${game.a} ${game.op} ${game.b}`);
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

    const anagramGame = activeAnagramGames[getChatKey(chatId)];
    if (anagramGame) {
      await safeSendMessage(chatId, `💡 Подсказка: ${anagramGame.hint}`);
      return;
    }

    const reverseGame = activeReverseWordGames[getChatKey(chatId)];
    if (reverseGame) {
      await safeSendMessage(chatId, `💡 Подсказка: ${reverseGame.hint}`);
      return;
    }

    const cipherGame = activeCipherGames[getChatKey(chatId)];
    if (cipherGame) {
      await safeSendMessage(chatId, `💡 Подсказка: ${cipherGame.hint}`);
      return;
    }

    return;
  }

  if (lowerText === "я сдаюсь" || lowerText === "сдаться") {
    const key = getChatKey(chatId);

    if (activeGuessWordGames[key]) {
      const game = activeGuessWordGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearGuessWord(chatId);
      return;
    }

    if (activeEmojiGuessGames[key]) {
      const game = activeEmojiGuessGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearEmojiGuess(chatId);
      return;
    }

    if (activeHangmanGames[key]) {
      const game = activeHangmanGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearHangman(chatId);
      return;
    }

    if (activeAnagramGames[key]) {
      const game = activeAnagramGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearAnagram(chatId);
      return;
    }

    if (activeReverseWordGames[key]) {
      const game = activeReverseWordGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearReverseWord(chatId);
      return;
    }

    if (activeCapitalGames[key]) {
      const game = activeCapitalGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nПравильный ответ: ${game.capital}`);
      clearCapitalGame(chatId);
      return;
    }

    if (activeCipherGames[key]) {
      const game = activeCipherGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nСлово было: ${game.word}`);
      clearCipherGame(chatId);
      return;
    }

    if (activeQuizGames[key]) {
      const game = activeQuizGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nПравильный ответ: ${game.options[game.correctIndex]}`);
      clearQuizGame(chatId);
      return;
    }

    if (activeOddOneGames[key]) {
      const game = activeOddOneGames[key];
      await safeSendMessage(chatId, `😢 Сдался(ась): ${getUserName(msg.from)}.\nПравильный вариант: ${game.correctIndex + 1} (${game.explanation})`);
      clearOddOneGame(chatId);
      return;
    }

    if (activeReactionGames[key]) {
      const game = activeReactionGames[key];
      await safeSendMessage(chatId, `😢 Игра остановлена. Нужно было написать: ${game.target}`);
      clearReactionGame(chatId);
      return;
    }

    if (activeHangmanPvPGames[key] && activeHangmanPvPGames[key].stage === "active") {
      const game = activeHangmanPvPGames[key];
      if (Number(msg.from.id) === Number(game.guesserUser.id)) {
        await safeSendMessage(
          chatId,
          `😢 ${getUserLink(msg.from)} сдался(ась).\nПравильный ответ: ${escapeHtml(game.word)}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
        delete activeHangmanPvPGames[key];
        return;
      }
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
    if (getActiveGameName(chatId)) {
      await safeSendMessage(chatId, `❌ Игра уже идёт: ${getActiveGameName(chatId)}`);
      return;
    }

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


  const quizGame = activeQuizGames[getChatKey(chatId)];
  const answerMatch = lowerText.match(/^ответ\s+([1-4])$/);
  if (quizGame && answerMatch) {
    const index = Number(answerMatch[1]) - 1;
    if (index === quizGame.correctIndex) {
      await safeSendMessage(chatId, `🏆 Правильно! Ответ: ${quizGame.options[quizGame.correctIndex]}\nУгадал(а): ${getUserName(msg.from)}`);
      clearQuizGame(chatId);
    } else {
      await safeSendMessage(chatId, "❌ Неверно!");
    }
    return;
  }

  const oddOneGame = activeOddOneGames[getChatKey(chatId)];
  const variantMatch = lowerText.match(/^вариант\s+([1-4])$/);
  if (oddOneGame && variantMatch) {
    const index = Number(variantMatch[1]) - 1;
    if (index === oddOneGame.correctIndex) {
      await safeSendMessage(chatId, `🏆 Правильно! Лишнее: ${oddOneGame.options[oddOneGame.correctIndex]}\n${oddOneGame.explanation}\nУгадал(а): ${getUserName(msg.from)}`);
      clearOddOneGame(chatId);
    } else {
      await safeSendMessage(chatId, "❌ Неверно!");
    }
    return;
  }

  const capitalGame = activeCapitalGames[getChatKey(chatId)];
  if (capitalGame && lowerText === normalizeText(capitalGame.capital)) {
    await safeSendMessage(chatId, `🏆 Правильно! Столица страны ${capitalGame.country} — ${capitalGame.capital}\nУгадал(а): ${getUserName(msg.from)}`);
    clearCapitalGame(chatId);
    return;
  }

  const cipherGame = activeCipherGames[getChatKey(chatId)];
  if (cipherGame && lowerText === normalizeText(cipherGame.word)) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${cipherGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
    clearCipherGame(chatId);
    return;
  }

  const reactionGame = activeReactionGames[getChatKey(chatId)];
  if (reactionGame && lowerText === normalizeText(reactionGame.target)) {
    const ms = Date.now() - reactionGame.startedAt;
    await safeSendMessage(chatId, `⚡ Победа!\n${getUserName(msg.from)} успел(а) первым(ой) за ${ms} мс`);
    clearReactionGame(chatId);
    return;
  }

  const guessWordGame = activeGuessWordGames[getChatKey(chatId)];
  if (guessWordGame && lowerText === normalizeText(guessWordGame.word)) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${guessWordGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
    clearGuessWord(chatId);
    return;
  }

  const guessNumberGame = activeGuessNumberGames[getChatKey(chatId)];
  if (guessNumberGame && /^\d+$/.test(lowerText)) {
    const num = Number(lowerText);
    if (num === guessNumberGame.target) {
      await safeSendMessage(chatId, `🏆 Правильно! Я загадал число ${guessNumberGame.target}\nУгадал(а): ${getUserName(msg.from)}`);
      clearGuessNumber(chatId);
    } else if (num < guessNumberGame.target) {
      await safeSendMessage(chatId, "📈 Больше!");
    } else {
      await safeSendMessage(chatId, "📉 Меньше!");
    }
    return;
  }

  const emojiGame = activeEmojiGuessGames[getChatKey(chatId)];
  if (emojiGame && lowerText === normalizeText(emojiGame.word)) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${emojiGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
    clearEmojiGuess(chatId);
    return;
  }

  const anagramGame = activeAnagramGames[getChatKey(chatId)];
  if (anagramGame && lowerText === normalizeText(anagramGame.word)) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${anagramGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
    clearAnagram(chatId);
    return;
  }

  const reverseGame = activeReverseWordGames[getChatKey(chatId)];
  if (reverseGame && lowerText === normalizeText(reverseGame.word)) {
    await safeSendMessage(chatId, `🏆 Правильно! Слово было: ${reverseGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
    clearReverseWord(chatId);
    return;
  }

  const mathGame = activeMathGames[getChatKey(chatId)];
  if (mathGame && /^-?\d+$/.test(lowerText)) {
    const num = Number(lowerText);
    if (num === mathGame.answer) {
      await safeSendMessage(chatId, `🏆 Правильно! Ответ: ${mathGame.answer}\nУгадал(а): ${getUserName(msg.from)}`);
      clearMathGame(chatId);
    }
    return;
  }

  const hangmanGame = activeHangmanGames[getChatKey(chatId)];
  if (hangmanGame && /^[a-zа-яёіїєґ]+$/i.test(text)) {
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
          await safeSendMessage(chatId, `🏆 Ты выиграл!\nСлово: ${hangmanGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
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
      await safeSendMessage(chatId, `🏆 Ты выиграл!\nСлово: ${hangmanGame.word}\nУгадал(а): ${getUserName(msg.from)}`);
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


  if (lowerText === "быстрый счет") {
    if (getActiveGameName(chatId)) return;

    const a = Math.floor(Math.random()*50);
    const b = Math.floor(Math.random()*50);

    activeMathGames[getChatKey(chatId)] = {
      answer: a + b
    };

    await safeSendMessage(chatId, `⚡ Кто быстрее решит:\n${a} + ${b}`);
    return;
  }

  if (lowerText === "кто быстрее") {
    if (getActiveGameName(chatId)) return;

    const words = ["огонь","кот","пицца","бот","игра"];
    const word = getRandomFromArray(words);

    activeReactionGames[getChatKey(chatId)] = {
      target: word,
      startedAt: Date.now()
    };

    await safeSendMessage(chatId, `⚡ Кто первый напишет: ${word}`);
    return;
  }

console.log("Games-only bot started");
