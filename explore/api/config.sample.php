<?php
/**
 * Explore — server configuration
 *
 * 1. Copy this file to config.php (same folder).
 * 2. Paste your ElevenLabs API key below (elevenlabs.io → Profile → API keys).
 * 3. Upload config.php by FTP. Never commit config.php to git.
 */

define('ELEVENLABS_API_KEY', 'PASTE_YOUR_ELEVENLABS_KEY_HERE');

// Model: eleven_multilingual_v2 (richest), eleven_turbo_v2_5 (faster, cheaper), eleven_flash_v2_5 (fastest).
define('ELEVENLABS_MODEL', 'eleven_multilingual_v2');

// Only generate audio for requests coming from these hosts (subdomains included).
define('TTS_ALLOWED_HOSTS', ['kreathaus.com', 'localhost', '127.0.0.1']);

// New generations allowed per day (cached lines are free and don't count).
define('TTS_DAILY_CAP', 300);

// Leave as is unless testing against a mock server.
define('ELEVENLABS_API_BASE', 'https://api.elevenlabs.io');
