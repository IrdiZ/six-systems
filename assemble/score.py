"""Score the assembled case against the simulator's answer key.

The assembler never reads truth.json. This step does, only to measure how much of
the truth survived as usable data, and to show what never arrived at all.
"""

from .parsers import Rec

STATUSES = ("DATA", "CONFLICT", "PICTURE", "LOST")


def close_enough(got, want) -> bool:
    if isinstance(want, str) or isinstance(got, str):
        return str(got).strip().lower() == str(want).strip().lower()
    if got is None:
        return False
    return abs(float(got) - float(want)) <= max(0.05 * abs(float(want)), 0.05)


def score(truth: dict, recs: list[Rec], unlinked: set[str]) -> list[dict]:
    """One row per true fact: what the pipeline made of it."""
    index = {(r.bsn, r.fact, r.file): r for r in recs}
    rows = []
    for t in truth["facts"]:
        r = index.get((t["bsn"], t["fact"], t["file"]))
        row = {k: v for k, v in t.items() if k != "value"}
        row["truth_value"] = t["value"]
        if t["file"] is None:
            row.update(status="LOST", got=None, correct=False, steps=[], reason=t["loss"], excerpt="", media=None)
        elif t["file"] in unlinked:
            row.update(status="LOST", got=None, correct=False, steps=[],
                       reason="Arrived, but could not be linked to a patient: no BSN and no name + birth date match",
                       excerpt="", media=None)
        elif r is None:
            row.update(status="LOST", got=None, correct=False, steps=[], reason="Present in the archive, but nothing could read it",
                       excerpt="", media=None)
        else:
            ok = r.status != "LOST" and close_enough(r.value, t["value"])
            reason = {
                "DATA": "Structured, coded and in the right unit on arrival",
                "CONFLICT": "Recovered only after code, unit or identity repair",
                "PICTURE": "Recovered by reading an image or PDF; there is no structured field behind it",
                "LOST": "; ".join(x for x in r.steps if not x.startswith("hospital number")),
            }[r.status]
            row.update(status=r.status, got=r.value, correct=ok, steps=r.steps, reason=reason,
                       excerpt=r.excerpt, media=r.media, time_seen=r.time)
            if r.status != "LOST" and not ok:
                row["reason"] += f" (value came out wrong: {r.value} vs true {t['value']})"
        rows.append(row)
    return rows


def summarise(rows: list[dict]) -> dict:
    n = len(rows)
    by_status = {s: sum(1 for r in rows if r["status"] == s) for s in STATUSES}
    recovered = sum(1 for r in rows if r["status"] != "LOST" and r["correct"])
    in_archive = sum(1 for r in rows if r["file"] is not None)
    by_source: dict[str, dict[str, int]] = {}
    for r in rows:
        by_source.setdefault(r["source"], {s: 0 for s in STATUSES})[r["status"]] += 1
    return {
        "facts": n,
        "by_status": by_status,
        "archive_pct": round(100 * in_archive / n, 1),
        "usable_pct": round(100 * by_status["DATA"] / n, 1),
        "recovered_pct": round(100 * recovered / n, 1),
        "wrong": sum(1 for r in rows if r["status"] != "LOST" and not r["correct"]),
        "by_source": by_source,
    }
