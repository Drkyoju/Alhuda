# Lemma TTS clips (Fish Hakim, Whisper-verified)

Pre-recorded MP3s for short lemmas where **live** Fish Hakim is unreliable.
**v322 fidelity:** spoken/transcript bare words must match the written UI phrase
(tashkeel / spacing / NFC only — no «أعني…», «الذال ثم…», «حشرة…» pads).

Examples covered: ذباب / قرب ذبابا، لا ضرر ولا ضرار، أهل اليمن، الرياء، الشرك الأكبر،
صح/خطأ، **أنواط**، ذات أنواط، **العزى، **اللهو** / اللهو واللعب**، اللات، مناة، بضع، صابئة، ما عبد، شرك، رقى، أبو هريرة.

- Served by `server.mjs` `/api/tts` when the request bare-key matches `manifest.json`
  (`X-TTS-Provider: fish-lemma-clip`).
- UI display text is unchanged.
- Regenerate: `node scripts/harvest_fidelity_lemma_clips.mjs --local-fish --new-only`
  Hard stubs: `--only=أنواط` / `--only=العزى` with `--retries=48 --stability=5`.

v322 fixes (Whisper 5/5): standalone **أنواط** (was أنواع); **العزى** via الْعُزَّيْ (was العزة).

Do **not** put secrets here. Clips are voice audio only.
