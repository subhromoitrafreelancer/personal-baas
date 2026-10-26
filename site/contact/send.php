<?php
// Stead contact form handler. Set the real address in STEAD_CONTACT_TO below (or as an env var).
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

const CONTACT_TO_DEFAULT = 'CHANGE_ME@example.com';
const FROM_ADDRESS = 'noreply@dataharmoni.com'; // must be on your own domain, or Hostinger mail() may drop it
const MAX_PER_HOUR = 5;

function fail(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed.', 405);

// Honeypot: bots fill this in, people never see it.
if (!empty($_POST['website'])) { echo json_encode(['ok' => true]); exit; }

// Rate limit per IP, stored in a file outside public access when possible.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$dir = sys_get_temp_dir() . '/stead-contact';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$file = $dir . '/' . hash('sha256', $ip);
$hits = array_filter(array_map('intval', @file($file, FILE_IGNORE_NEW_LINES) ?: []), fn($t) => $t > time() - 3600);
if (count($hits) >= MAX_PER_HOUR) fail('Too many messages from this address. Please try again later.', 429);

function clean(string $s, int $max): string {
    $s = trim(str_replace("\0", '', $s));
    return mb_substr($s, 0, $max);
}
function oneLine(string $s): string { return trim(preg_replace('/[\r\n]+/', ' ', $s)); }

$name    = oneLine(clean($_POST['name'] ?? '', 120));
$email   = oneLine(clean($_POST['email'] ?? '', 200));
$topic   = clean($_POST['topic'] ?? 'other', 20);
$message = clean($_POST['message'] ?? '', 4000);
$rebuild = clean($_POST['rebuild'] ?? '', 2000);

if ($name === '' || $message === '') fail('Please fill in your name and a message.');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('That email address does not look right.');
$topics = ['question' => 'Question', 'feedback' => 'Feedback', 'project' => 'Project', 'other' => 'Other'];
$label = $topics[$topic] ?? 'Other';

$to = getenv('STEAD_CONTACT_TO') ?: CONTACT_TO_DEFAULT;
if ($to === CONTACT_TO_DEFAULT) fail('The contact form is not configured yet.', 500);

$subject = '[Stead] ' . $label . ' from ' . $name;
$body = "Name: $name\nEmail: $email\nTopic: $label\n\nMessage:\n$message\n"
      . ($rebuild !== '' ? "\nWhat they rebuild every time:\n$rebuild\n" : '');
$headers = [
    'From' => FROM_ADDRESS,
    'Reply-To' => $email,
    'Content-Type' => 'text/plain; charset=utf-8',
    'X-Mailer' => 'stead-contact',
];
$sent = mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
if (!$sent) fail('The message could not be sent. Please try again later.', 500);

$hits[] = time();
@file_put_contents($file, implode("\n", $hits));
echo json_encode(['ok' => true]);
