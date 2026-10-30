<?php
/**
 * Interior — guide voice proxy
 *
 * POST  { "text": "...", "voice": "<elevenlabs voice id>", "speed": 0.9 }
 * →     audio/mpeg (generated once, then served from api/cache/ forever)
 *
 * The ElevenLabs key never leaves this server. Copy config.sample.php to
 * config.php and paste your key there. config.php is ignored by git.
 */

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'not_configured', 'message' => 'api/config.php is missing. Copy config.sample.php and add your ElevenLabs key.']);
    exit;
}
require $configFile;

$apiKey   = defined('ELEVENLABS_API_KEY') ? trim((string) ELEVENLABS_API_KEY) : '';
$apiBase  = defined('ELEVENLABS_API_BASE') ? rtrim((string) ELEVENLABS_API_BASE, '/') : 'https://api.elevenlabs.io';
$model    = defined('ELEVENLABS_MODEL') ? (string) ELEVENLABS_MODEL : 'eleven_multilingual_v2';
$dailyCap = defined('TTS_DAILY_CAP') ? (int) TTS_DAILY_CAP : 300;
$allowedHosts = defined('TTS_ALLOWED_HOSTS') ? (array) TTS_ALLOWED_HOSTS : [];

if ($apiKey === '' || $apiKey === 'PASTE_YOUR_ELEVENLABS_KEY_HERE') {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'not_configured', 'message' => 'No ElevenLabs key in api/config.php yet.']);
    exit;
}

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) { @mkdir($cacheDir, 0755, true); }

// Only accept requests from the site itself (soft guard against drive-by quota burn).
if ($allowedHosts) {
    $ref = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
    $host = $ref ? (parse_url($ref, PHP_URL_HOST) ?: '') : '';
    $ok = false;
    foreach ($allowedHosts as $h) {
        if ($host === $h || (str_ends_with($host, '.' . $h))) { $ok = true; break; }
    }
    if (!$ok) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'forbidden_origin']);
        exit;
    }
}

// GET ?voices=1 → the voices in this ElevenLabs library (everything but the stock premade set),
// so a voice added at elevenlabs.io shows up in the app's Settings without a code change.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['voices'])) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    $vfile = $cacheDir . '/_voices.json';
    if (is_file($vfile) && (time() - filemtime($vfile)) < 300) { readfile($vfile); exit; }
    $ch = curl_init($apiBase . '/v1/voices');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => ['xi-api-key: ' . $apiKey, 'Accept: application/json'],
    ]);
    $res    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $out = ['voices' => []];
    if ($res !== false && $status === 200) {
        $j = json_decode((string) $res, true);
        foreach (($j['voices'] ?? []) as $v) {
            if (($v['category'] ?? '') === 'premade') { continue; }
            $labels = is_array($v['labels'] ?? null) ? $v['labels'] : [];
            $bits = [];
            foreach (['accent', 'description', 'age'] as $k) {
                if (!empty($labels[$k]) && is_string($labels[$k])) { $bits[] = ucfirst($labels[$k]); }
            }
            if (!preg_match('/^[A-Za-z0-9]{8,64}$/', (string) ($v['voice_id'] ?? ''))) { continue; }
            $out['voices'][] = ['id' => $v['voice_id'], 'name' => (string) ($v['name'] ?? 'Voice'), 'note' => implode(' · ', $bits)];
        }
        @file_put_contents($vfile, json_encode($out), LOCK_EX);
    } else {
        http_response_code(502);
        $out['error'] = 'upstream';
        $out['status'] = $status;
    }
    echo json_encode($out);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw ?: '', true);
if (!is_array($in)) { $in = []; }

$text  = isset($in['text']) ? trim((string) $in['text']) : '';
$voice = isset($in['voice']) ? (string) $in['voice'] : '';
$speed = isset($in['speed']) ? (float) $in['speed'] : 1.0;

$text  = preg_replace('/\s+/u', ' ', $text);
$speed = max(0.7, min(1.2, round($speed, 2)));

if ($text === '' || mb_strlen($text) > 700) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'bad_text', 'message' => 'Text must be 1–700 characters.']);
    exit;
}
if (!preg_match('/^[A-Za-z0-9]{8,64}$/', $voice)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'bad_voice']);
    exit;
}

$key  = sha1($model . '|' . $voice . '|' . number_format($speed, 2, '.', '') . '|' . $text);
$file = $cacheDir . '/' . $key . '.mp3';

function serveFile(string $file, string $hit): void
{
    header('Content-Type: audio/mpeg');
    header('Content-Length: ' . (string) filesize($file));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Cache: ' . $hit);
    readfile($file);
    exit;
}

if (is_file($file) && filesize($file) > 0) {
    serveFile($file, 'HIT');
}

// Daily generation cap (cache hits are free; only new generations count).
$quotaFile = $cacheDir . '/_quota_' . gmdate('Ymd');
$count = is_file($quotaFile) ? (int) file_get_contents($quotaFile) : 0;
if ($count >= $dailyCap) {
    http_response_code(429);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'daily_cap', 'message' => 'Daily generation cap reached.']);
    exit;
}

$payload = json_encode([
    'text'     => $text,
    'model_id' => $model,
    'voice_settings' => [
        'stability'         => 0.62,
        'similarity_boost'  => 0.80,
        'style'             => 0.12,
        'use_speaker_boost' => true,
        'speed'             => $speed,
    ],
]);

$url = $apiBase . '/v1/text-to-speech/' . $voice . '?output_format=mp3_44100_96';
$ch  = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 40,
    CURLOPT_HTTPHEADER     => [
        'xi-api-key: ' . $apiKey,
        'Content-Type: application/json',
        'Accept: audio/mpeg',
    ],
]);
$audio  = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($audio === false || $status !== 200 || strlen((string) $audio) < 200) {
    http_response_code(502);
    header('Content-Type: application/json');
    $detail = $err ?: (is_string($audio) ? mb_substr(strip_tags($audio), 0, 300) : '');
    echo json_encode(['error' => 'upstream', 'status' => $status, 'message' => $detail]);
    exit;
}

@file_put_contents($quotaFile, (string) ($count + 1), LOCK_EX);
$tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
if (@file_put_contents($tmp, $audio, LOCK_EX) !== false && @rename($tmp, $file)) {
    serveFile($file, 'MISS');
}

// Cache write failed (permissions?) — still return the audio.
header('Content-Type: audio/mpeg');
header('Content-Length: ' . (string) strlen($audio));
header('Cache-Control: no-store');
header('X-Cache: BYPASS');
echo $audio;
