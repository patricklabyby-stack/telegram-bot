function getRandomGift() {
  const gifts = [
    "шоколад 🍫",
    "цветы 🌹",
    "плюшевого мишку 🧸",
    "пиццу 🍕",
    "айфон 📱",
    "конфеты 🍬",
    "торт 🎂",
    "звезду ⭐",
    "машину 🏎️",
    "деньги 💸",
    "кольцо 💍",
    "мороженое 🍦",
    "сок 🧃",
    "бургер 🍔",
    "печенье 🍪"
  ];
  return gifts[Math.floor(Math.random() * gifts.length)];
}

function getRandomRating() {
  return Math.floor(Math.random() * 10) + 1;
}

function getRandomPrediction() {
  const predictions = [
    "Сегодня тебе повезёт 😎",
    "Будь осторожен сегодня 😬",
    "Тебя ждёт сюрприз 🎁",
    "Сегодня твой день 🔥",
    "Лучше отдохни 😴",
    "Сегодня удача на твоей стороне 🍀",
    "Возможны проблемы 💀",
    "Жди хороших новостей 📩",
    "Сегодня будет весело 😂",
    "Не рискуй сегодня ⚠️"
  ];
  return predictions[Math.floor(Math.random() * predictions.length)];
}
