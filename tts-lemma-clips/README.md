# Lemma TTS clips (Fish Hakim, Whisper-verified)

Pre-recorded MP3s for short lemmas where **live** Fish Hakim is unreliable.
**v321 fidelity:** spoken/transcript bare words must match the written UI phrase
(tashkeel / spacing / NFC only — no «أعني…», «الذال ثم…», «حشرة…» pads).

Examples covered: ذباب / قرب ذبابا، لا ضرر ولا ضرار، أهل اليمن، الرياء، الشرك الأكبر،
صح/خطأ، ذات أنواط، اللات، مناة، بضع، صابئة، ما عبد، شرك، رقى، أبو هريرة.

- Served by `server.mjs` `/api/tts` when the request bare-key matches `manifest.json`
  (`X-TTS-Provider: fish-lemma-clip`).
- UI display text is unchanged.
- Regenerate: `node scripts/harvest_fidelity_lemma_clips.mjs --local-fish --new-only`

Honest Fish-hard leftovers (no inventing allowed): standalone **أنواط** → أنواع;
**العزى** → العزة.

Do **not** put secrets here. Clips are voice audio only.
