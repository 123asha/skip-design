<?php
/**
 * Copy this file to `tg-config.php` ON THE SERVER (in the same folder as
 * lead.php / index.html) and fill in your real values.
 *
 * `tg-config.php` is git-ignored — your bot token never goes into the repo.
 *
 * How to get the values:
 *  - bot_token: create a bot via @BotFather in Telegram → it gives you a token
 *    like 123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *  - chat_id: create a group/channel for leads, add your bot to it, then open
 *    https://api.telegram.org/bot<TOKEN>/getUpdates and read the "chat":{"id":...}.
 *    (For a private chat with the bot, message it once first.)
 *  - email: optional — a mailbox to also receive every lead (recommended as a
 *    backup in case Telegram's API is unreachable from the host).
 */

return [
    'bot_token' => 'PUT-YOUR-BOT-TOKEN-HERE',
    'chat_id'   => 'PUT-YOUR-CHAT-ID-HERE',
    'email'     => 'hi@skip.design',
];
