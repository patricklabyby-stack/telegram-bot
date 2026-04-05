function getRandomCoins() {
  return Math.floor(Math.random() * 101);
}

function getRandomHuntCoins() {
  return Math.floor(Math.random() * 11);
}

function getHuntResult() {
  const normalAnimals = [
    { animal: "🐰 Поймал зайца!" },
    { animal: "🦊 Поймал лису!" },
    { animal: "🐗 Поймал кабана!" },
    { animal: "🦌 Поймал оленя!" }
  ];

  if (Math.random() < 0.25) {
    return {
      text: "🐻 Ты нашёл медведя... Он тебя прогнал!",
      coins: -getRandomHuntCoins()
    };
  }

  const chosen = normalAnimals[Math.floor(Math.random() * normalAnimals.length)];

  return {
    text: chosen.animal,
    coins: getRandomHuntCoins()
  };
}

module.exports = {
  getRandomCoins,
  getRandomHuntCoins,
  getHuntResult
};
