#!/usr/bin/env python3
"""Deterministic validator for the kinesiology dataset.

Mechanical checks only -- schema shape, referential integrity, and the presence of
specific fixes that a previous verification round demanded. Semantic questions
("does this citation really test this exercise?") are NOT checkable here and are
handled by a separate cross-model verification pass.

Exit code 0 = all checks pass, 1 = at least one FAIL.
"""
import json
import sys

REQUIRED_EXERCISE_KEYS = {
    "exercise_id", "name_en", "name_zh", "equipment_type", "movement_plane",
    "joint_actions", "muscle_engagement", "source_refs",
}
VALID_ROLES = {"prime_mover", "synergist", "stabilizer"}

fails, warns, passes = [], [], []


def check(cond, ok_msg, fail_msg, warn_only=False):
    if cond:
        passes.append(ok_msg)
    elif warn_only:
        warns.append(fail_msg)
    else:
        fails.append(fail_msg)


def main(ex_path, mu_path):
    exercises = json.load(open(ex_path))
    muscles = json.load(open(mu_path))
    muscle_ids = {m["muscle_id"] for m in muscles}

    # ---- schema shape
    for e in exercises:
        missing = REQUIRED_EXERCISE_KEYS - set(e)
        check(not missing, f"schema ok: {e.get('exercise_id')}",
              f"schema: {e.get('exercise_id')} missing {sorted(missing)}")
        for eng in e.get("muscle_engagement", []):
            check(eng.get("role") in VALID_ROLES,
                  f"role ok: {e['exercise_id']}/{eng.get('muscle_id')}",
                  f"role: {e['exercise_id']}/{eng.get('muscle_id')} "
                  f"invalid role {eng.get('role')!r}")
        check(bool(e.get("source_refs")), f"has refs: {e['exercise_id']}",
              f"source_refs empty: {e['exercise_id']}")

    # ---- referential integrity (this is what caught core_stabilizers/teres_minor)
    orphans = set()
    for e in exercises:
        for eng in e.get("muscle_engagement", []):
            mid = eng.get("muscle_id")
            if mid not in muscle_ids:
                orphans.add(f"{e['exercise_id']} -> {mid}")
    check(not orphans, "referential integrity: no orphan muscle_ids",
          f"ORPHAN muscle_ids: {sorted(orphans)}")

    # ---- duplicate ids
    ids = [e["exercise_id"] for e in exercises]
    dupes = {i for i in ids if ids.count(i) > 1}
    check(not dupes, "no duplicate exercise_ids", f"duplicate exercise_ids: {sorted(dupes)}")

    by_id = {e["exercise_id"]: e for e in exercises}

    # ---- specific fixes demanded by the WP4 verification round
    check("seated_cable_row" not in by_id,
          "fix#1: seated_cable_row identity conflict resolved",
          "fix#1: seated_cable_row still present (ID/content mismatch unresolved)")

    lr = by_id.get("lateral_raise")
    if lr:
        blob = json.dumps(lr, ensure_ascii=False)
        check("International Journal of Environmental Research" in blob,
              "fix#2a: Coratella journal corrected to IJERPH",
              "fix#2a: Coratella journal not corrected")
        ant = next((x for x in lr["muscle_engagement"]
                    if x["muscle_id"] == "deltoid_anterior"), None)
        if ant:
            note = ant.get("note", "").lower()
            check("extern" in note and "intern" not in note.replace("external", ""),
                  "fix#2b: anterior deltoid note now says externally rotated",
                  f"fix#2b: anterior deltoid note still wrong direction: {ant.get('note')!r}")

    rf = by_id.get("reverse_fly")
    if rf:
        check("Sports Medicine and Physical Fitness" in json.dumps(rf, ensure_ascii=False),
              "fix#3: Franke journal corrected",
              "fix#3: Franke journal not corrected")

    ht = by_id.get("barbell_hip_thrust")
    if ht:
        blob = json.dumps(ht, ensure_ascii=False)
        check("bioRxiv" not in blob, "fix#4: bioRxiv mixed citation removed",
              "fix#4: bioRxiv still mixed into citation")

    # fix#6 ExRx paths
    cr = by_id.get("crunch")
    if cr:
        blob = json.dumps(cr, ensure_ascii=False)
        check("BWCcrunch" not in blob, "fix#6a: BWCcrunch typo fixed",
              "fix#6a: BWCcrunch typo still present")
    hlr = by_id.get("hanging_leg_raise")
    if hlr:
        blob = json.dumps(hlr, ensure_ascii=False)
        check("RectusAbdominis/BWHangingLegRaise" not in blob,
              "fix#6b: hanging leg raise ExRx path recategorised",
              "fix#6b: hanging leg raise still under RectusAbdominis/")

        # fix#7 -- the most important one: hip flexors must be present and be the
        # prime movers, with rectus abdominis demoted off prime_mover.
        prime = {x["muscle_id"] for x in hlr["muscle_engagement"]
                 if x["role"] == "prime_mover"}
        has_hip_flexor = bool(prime & {"iliopsoas", "rectus_femoris", "psoas_major",
                                       "iliacus", "hip_flexors"})
        check(has_hip_flexor,
              f"fix#7: hanging_leg_raise prime movers now include hip flexors {sorted(prime)}",
              f"fix#7: hanging_leg_raise prime movers still lack hip flexors: {sorted(prime)}")
        check("rectus_abdominis" not in prime,
              "fix#7: rectus abdominis no longer sole/prime mover",
              "fix#7: rectus abdominis still listed as prime_mover")
        blob_l = blob.lower()
        check("lower fiber" not in blob_l and "lower fibre" not in blob_l,
              "fix#7: 'lower fibers preferentially' myth text removed",
              "fix#7: 'lower fibers' myth text still present")

    # ---- GENERAL action/role consistency ------------------------------------------
    # This class of defect has now appeared three separate times: hanging_leg_raise
    # claimed spinal flexion with no muscle producing it; a "scapular depression"
    # action was added with no muscle producing it (while fixing the first one);
    # single_arm_dumbbell_row claims elbow flexion with no elbow flexor listed.
    # Rather than assert each case by name, check the whole dataset: if an exercise
    # claims a joint action, at least one listed muscle must be capable of producing
    # it. Unmapped actions are skipped rather than guessed at.
    ACTION_MUSCLES = {
        "elbow flexion": {"biceps_brachii", "brachialis", "brachioradialis"},
        "elbow extension": {"triceps_brachii", "anconeus"},
        "hip flexion": {"iliopsoas", "rectus_femoris", "psoas_major", "iliacus",
                        "tensor_fasciae_latae", "sartorius"},
        "hip extension": {"gluteus_maximus", "hamstrings", "adductor_magnus",
                          "biceps_femoris", "semitendinosus", "semimembranosus"},
        "knee extension": {"vastus_muscles", "rectus_femoris", "quadriceps"},
        "knee flexion": {"hamstrings", "biceps_femoris", "semitendinosus",
                         "semimembranosus", "gastrocnemius", "gracilis", "sartorius"},
        "spinal flexion": {"rectus_abdominis", "obliques"},
        "scapular depression": {"trapezius_lower", "latissimus_dorsi", "pectoralis_minor"},
        "scapular retraction": {"rhomboids", "trapezius_middle"},
    }
    for e in exercises:
        listed = {m["muscle_id"] for m in e.get("muscle_engagement", [])}
        for action in e.get("joint_actions", []):
            a = action.lower()
            for key, producers in ACTION_MUSCLES.items():
                if key not in a:
                    continue
                # an isometric/stabilisation qualifier means no motion is claimed
                if any(w in a for w in ("isometric", "stabil", "resist", "prevent")):
                    continue
                check(bool(listed & producers),
                      f"action/role: {e['exercise_id']} '{action}' has a producer",
                      f"action/role: {e['exercise_id']} claims '{action}' but lists no "
                      f"muscle able to produce it (have: {sorted(listed)})")

    # ---- round-2 findings: two direction/consistency errors that would misinform
    ssp = by_id.get("standing_shoulder_press")
    if ssp:
        es = next((x for x in ssp["muscle_engagement"]
                   if x["muscle_id"] == "erector_spinae"), None)
        if es:
            note = es.get("note", "").lower()
            # Erector spinae IS the spinal extensor -- it cannot "resist extension".
            # Resisting lumbar hyperextension is anti-extension work by the abdominals.
            check("resists extension" not in note,
                  "round2#1: erector spinae no longer described as resisting extension",
                  f"round2#1: erector spinae still says 'resists extension': {es.get('note')!r}")

    if hlr:
        ja = " ".join(hlr.get("joint_actions", [])).lower()
        ra = next((x for x in hlr["muscle_engagement"]
                   if x["muscle_id"] == "rectus_abdominis"), None)
        ra_role = ra.get("role") if ra else None
        # If spinal flexion is claimed as a joint action, some muscle must produce it.
        # Listing it while rectus abdominis is only a stabilizer is self-contradictory.
        check(not ("spinal flexion" in ja and ra_role == "stabilizer"),
              "round2#2: hanging_leg_raise joint_actions consistent with muscle roles",
              "round2#2: hanging_leg_raise claims spinal flexion but rectus abdominis "
              "is only a stabilizer (no muscle produces the claimed action)")

    # ---- citation traceability (was a 'suggested' fix: DOI/PMID present)
    acad_no_id = []
    for e in exercises:
        for r in e.get("source_refs", []):
            looks_academic = any(k in r for k in ["et al", "Journal", "Med Sci", "PLoS",
                                                  "Frontiers", "European Journal"])
            if looks_academic and not any(k in r for k in ["DOI", "doi", "PMID", "PMC"]):
                acad_no_id.append(f"{e['exercise_id']}: {r[:70]}")
    check(not acad_no_id, "citations: all academic refs carry DOI/PMID",
          f"citations without DOI/PMID ({len(acad_no_id)}): {acad_no_id[:5]}",
          warn_only=True)

    # ---- report
    print(f"PASS  {len(passes)}")
    for w in warns:
        print(f"WARN  {w}")
    for f in fails:
        print(f"FAIL  {f}")
    print()
    print(f"exercises={len(exercises)} muscles={len(muscles)} "
          f"fails={len(fails)} warns={len(warns)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
