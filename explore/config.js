/* Explore — client configuration
 *
 * FIREBASE: paste the web config from the Firebase project you use for
 * kreathaus.com/daily (Project settings → Your apps → Web app → config).
 * Same project is fine: Explore keeps its data in its own
 * "interior_users" collection. Leave apiKey empty to run without sign-in.
 *
 * VOICES: ElevenLabs voice IDs. Keep three to audition in Settings, or paste
 * any voice from your own ElevenLabs library (including a designed voice).
 */
window.INTERIOR_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  ttsEndpoint: "api/tts.php",
  voices: [
    { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",   note: "Warm, low, British. Unhurried." },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "Warm British male. Narrator-quiet." },
    { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", note: "Soft, continental English. Slightly husky." }
  ]
};
