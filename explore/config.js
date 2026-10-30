/* Explore — client configuration
 *
 * FIREBASE: the web config of the "Explore" Firebase project (explore-ea7ca).
 * These are public client values, locked to kreathaus.com in Firebase Auth;
 * the Firestore rules decide who can read or write.
 *
 * VOICES: the three default ElevenLabs voices. Anything added to the ElevenLabs
 * library appears in Settings automatically (api/tts.php?voices=1).
 */
window.INTERIOR_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDMJKB3qoZ4x-wXXeC50e6u8sRYsSFw9w4",
    authDomain: "explore-ea7ca.firebaseapp.com",
    projectId: "explore-ea7ca",
    storageBucket: "explore-ea7ca.firebasestorage.app",
    messagingSenderId: "352442765131",
    appId: "1:352442765131:web:341795ba8ce055c1ea22ce"
  },
  ttsEndpoint: "api/tts.php",
  voices: [
    { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   note: "Warm, low, British. Unhurried." },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "Warm British male. Narrator-quiet." },
    { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", note: "Soft, continental English. Slightly husky." }
  ]
};
