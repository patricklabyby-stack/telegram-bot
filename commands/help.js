function registerHelpCommands(bot, safeSendMessage) {
  bot.onText(/^\/start(@[A-Za-z0-9_]+)?$/, async (msg) => {
    await safeSendMessage(
      msg.chat.id,
      `Привет, ${msg.from.first_name || "друг"}! 👋

Добро пожаловать в Мини Модератор.

Напиши /help чтобы посмотреть команды.`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );
  });

  bot.onText(/^\/help(@[A-Za-z0-9_]+)?$/, async (msg) => {
    await safeSendMessage(
      msg.chat.id,
      `⚙️ Полный список команд в нашей статье:

https://teletype.in/@mini_moderator/mini_moderator`,
      {
        disable_web_page_preview: false
      }
    );
  });
}

module.exports = { registerHelpCommands };
