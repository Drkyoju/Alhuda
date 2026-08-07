#!/usr/bin/env python3
"""Batch-transcribe Arabic MP3s with OpenAI Whisper. Usage:
  .venv/bin/python scripts/whisper_transcribe.py --dir extracted/listen_audit --model small --out extracted/listen_stt_raw.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="ar")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    import whisper  # noqa: WPS433

    root = Path(args.dir)
    files = sorted(root.glob("*.mp3"))
    if args.limit > 0:
        files = files[: args.limit]
    if not files:
        print("No mp3 files", file=sys.stderr)
        return 1

    print(f"Loading whisper model={args.model}…", flush=True)
    model = whisper.load_model(args.model)
    results = []
    for i, path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {path.name}", flush=True)
        try:
            out = model.transcribe(
                str(path),
                language=args.lang,
                task="transcribe",
                fp16=False,
                verbose=False,
            )
            text = (out.get("text") or "").strip()
            results.append({"file": path.name, "id": path.stem, "transcript": text, "ok": True})
        except Exception as e:  # noqa: BLE001
            results.append(
                {
                    "file": path.name,
                    "id": path.stem,
                    "transcript": "",
                    "ok": False,
                    "error": str(e),
                }
            )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"model": args.model, "n": len(results), "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(results)} clips)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
