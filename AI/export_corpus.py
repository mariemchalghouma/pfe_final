"""Export corpus ready-for-annotation from segments_log.jsonl

Usage:
  python export_corpus.py [--log PATH] [--wav PATH] [--out DIR]

This script reads the segments JSONL (OUTPUT_SEGMENT_LOG) and writes:
 - a `corpus.jsonl` file with one object per segment (metadata + ASR hypotheses)
 - a `summary.csv` with a compact view
 - copy of full conversation WAV (if provided)

Note: the agent currently does not save per-segment WAV offsets. If you need
per-segment WAVs, update the recording pipeline to save segment files when
they are detected. This script collects metadata and text for annotation.
"""

import os, sys, json, shutil, argparse, time, csv


def load_constants():
    # Try to import AppelCall to reuse configured paths
    default = {
        "segments_log": os.path.join(os.path.expanduser("~"), "Downloads", "segments_log.jsonl"),
        "wav": os.path.join(os.path.expanduser("~"), "Downloads", "conversation_appel.wav"),
    }
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("appelcall", os.path.join(os.path.abspath(os.getcwd()), "..", "..", "..", "AppelCall.py"))
        # Fallback to workspace root AppelCall
        spec = importlib.util.spec_from_file_location("appelcall", os.path.join(os.path.abspath(os.getcwd()), "..", "AppelCall.py")) if spec is None else spec
        if spec and spec.loader:
            appel = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(appel)
            return {
                "segments_log": getattr(appel, "OUTPUT_SEGMENT_LOG", default["segments_log"]),
                "wav": getattr(appel, "OUTPUT_WAV", default["wav"]),
            }
    except Exception:
        pass
    return default


def ensure_dir(d):
    os.makedirs(d, exist_ok=True)
    return d


def export(log_path, wav_path, out_dir):
    if not os.path.exists(log_path):
        print(f"Segments log not found: {log_path}")
        return 1

    ensure_dir(out_dir)
    corpus_path = os.path.join(out_dir, "corpus.jsonl")
    csv_path = os.path.join(out_dir, "summary.csv")

    total = 0
    with open(corpus_path, "w", encoding="utf-8") as jf, open(csv_path, "w", encoding="utf-8", newline="") as cf:
        writer = csv.writer(cf)
        writer.writerow(["session_id", "n", "duree_s", "rms", "statut", "wer", "p1_words", "p2_words", "final_words", "texte_preview"])
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                total += 1
                # Normalize keys we expect
                seg = {
                    "id": f"{obj.get('session_id','')}_{obj.get('n', total)}",
                    "session_id": obj.get("session_id"),
                    "n": obj.get("n"),
                    "duree_s": obj.get("duree_s") or obj.get("duree", None) or (obj.get("segment_meta",{}).get("duree_calculee_s") if obj.get("segment_meta") else None),
                    "rms": obj.get("rms"),
                    "statut": obj.get("statut"),
                    "wer": obj.get("wer", obj.get("wer", None)),
                    "texte": obj.get("texte") or obj.get("texte", ""),
                    "passe1": obj.get("passe1"),
                    "passe2": obj.get("passe2"),
                    "brut_p1": obj.get("brut_p1") or obj.get("passe1", ""),
                    "brut_p2": obj.get("brut_p2") or obj.get("passe2", ""),
                    "reject_reason": obj.get("reject_reason"),
                    "segment_meta": obj.get("segment_meta"),
                    "raw": obj,
                }
                jf.write(json.dumps(seg, ensure_ascii=False) + "\n")
                writer.writerow([
                    seg.get("session_id"), seg.get("n"), seg.get("duree_s"), seg.get("rms"), seg.get("statut"), seg.get("wer"),
                    seg.get("raw", {}).get("p1_words") or (len((seg.get("passe1") or "").split())),
                    seg.get("raw", {}).get("p2_words") or (len((seg.get("passe2") or "").split())),
                    seg.get("raw", {}).get("final_words") or (len((seg.get("texte") or "").split())),
                    (seg.get("texte") or "")[:80]
                ])

    # Copy WAV if exists
    if wav_path and os.path.exists(wav_path):
        try:
            shutil.copy2(wav_path, os.path.join(out_dir, os.path.basename(wav_path)))
            print(f"Copied WAV to {out_dir}")
        except Exception as e:
            print(f"Failed to copy WAV: {e}")

    print(f"Exported {total} segments to {out_dir}")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", help="segments jsonl path")
    parser.add_argument("--wav", help="full conversation wav path")
    parser.add_argument("--out", help="output folder", default=f"corpus_export_{int(time.time())}")
    args = parser.parse_args()

    consts = load_constants()
    log_path = args.log or consts.get("segments_log")
    wav_path = args.wav or consts.get("wav")
    out_dir = args.out

    return export(log_path, wav_path, out_dir)


if __name__ == "__main__":
    raise SystemExit(main())
