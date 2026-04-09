function registerHelpCommands(bot, safeSendMessage) {
  bot.onText(/^\/start(@[A-Za-z0-9_]+)?$/, async (msg) => {
    await safeSendMessage(
      msg.chat.id,
      `🔥 <b>Мини Модератор</b> — бот для Telegram-групп

Привет, ${msg.from.first_name || "друг"}! 👋

Здесь ты можешь использовать команды для профиля, фана, RP и других возможностей бота.

Нажми /help чтобы открыть список команд.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  });

  bot.onText(/^\/help(@[A-Za-z0-9_]+)?$/, async (msg) => {
    await safeSendMessage(
      msg.chat.id,
      `⚙️ <b>Полный список команд</b>

Открыть статью с командами:
https://teletype.in/@mini_moderator/mini_moderator`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: false
      }
    );
  });
}

module.exports = { registerHelpCommands };
