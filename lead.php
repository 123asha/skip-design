<?php
/**
 * Contact-form relay for skip.design (Beget / any PHP host).
 *
 * Receives the JSON the site's contact form POSTs and forwards it to a Telegram
 * chat via the Bot API (and, optionally, duplicates it to an e-mail so a lead
 * is never lost if Telegram's API is unreachable from the server).
 *
 * SECRETS: the bot token / chat id are NOT stored here. Create a file named
 * `tg-config.php` next to this one on the server (it is git-ignored) — see
 * `tg-config.example.php`. Alternatively set TELEGRAM_BOT_TOKEN /
 * TELEGRAM_CHAT_ID as environment variables.
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method']);
    exit;
}

// ── Load secrets ────────────────────────────────────────────────────────────
$cfg = [];
if (is_file(__DIR__ . '/tg-config.php')) {
    $cfg = require __DIR__ . '/tg-config.php';
}
$token       = $cfg['bot_token'] ?? (getenv('TELEGRAM_BOT_TOKEN') ?: '');
$chatId      = $cfg['chat_id']   ?? (getenv('TELEGRAM_CHAT_ID')   ?: '');
$notifyEmail = $cfg['email']     ?? '';

// ── Parse body ──────────────────────────────────────────────────────────────
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

// Honeypot — bots fill hidden fields; humans leave it empty.
if (!empty($data['website'])) {
    echo json_encode(['ok' => true]);
    exit;
}

$contact = trim((string)($data['contact'] ?? ''));
$tab     = trim((string)($data['tab'] ?? ''));
$form    = trim((string)($data['form'] ?? ''));
$page    = trim((string)($data['page'] ?? ''));

if ($contact === '' || mb_strlen($contact) > 200) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'contact']);
    exit;
}

// Strip control chars to keep the message clean.
$clean = function ($v) {
    return preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
};

$tabLabel = $tab === 'join' ? 'Стать частью команды / консультация' : 'Обсудить проект';
$formLabel = $form === 'consult' ? 'страница услуг' : 'главная';

$lines = [
    '🟢 Новая заявка с сайта skip.design',
    'Контакт: ' . $clean($contact),
    'Раздел: ' . $tabLabel,
    'Откуда: ' . $formLabel,
];
if ($page !== '') {
    $lines[] = 'Страница: ' . $clean($page);
}
$text = implode("\n", $lines);

// ── Send to Telegram ────────────────────────────────────────────────────────
$sentTelegram = false;
if ($token !== '' && $chatId !== '' && function_exists('curl_init')) {
    $ch = curl_init("https://api.telegram.org/bot{$token}/sendMessage");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_POSTFIELDS     => http_build_query([
            'chat_id'                  => $chatId,
            'text'                     => $text,
            'disable_web_page_preview' => 'true',
        ]),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $sentTelegram = ($resp !== false && $code === 200);
}

// ── Duplicate to e-mail (fallback, never lose a lead) ───────────────────────
$sentEmail = false;
if ($notifyEmail !== '') {
    $subject = '=?UTF-8?B?' . base64_encode('Заявка с сайта skip.design') . '?=';
    $headers = "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "From: site@skip.design\r\n";
    $sentEmail = @mail($notifyEmail, $subject, $text, $headers);
}

if ($sentTelegram || $sentEmail) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'delivery']);
}
