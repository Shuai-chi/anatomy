#!/usr/bin/env python3
"""Build the muscle_id -> 3D mesh-name-prefix mapping.

This is the join between the data layer (muscle_id, from the kinesiology dataset)
and the asset layer (Z-Anatomy mesh names). It is written as explicit data rather
than fuzzy string matching because several mappings are one-to-many and are
anatomical judgements, not string similarity:

  - Group labels cover several distinct muscles (hamstrings -> 3 muscles; vastus
    -> 3 heads; obliques -> external + internal; rhomboids -> major + minor).
  - Z-Anatomy splits some muscles by head/part where the dataset treats them as one
    (triceps -> 3 heads; biceps brachii -> 2 heads; deltoid parts use anatomical
    names, not the gym's anterior/lateral/posterior).
  - Trapezius parts use descending/transverse/ascending, which map to the gym's
    upper/middle/lower.

Mesh names carry a .l/.r side suffix and the glTF exporter may append
"_primitive0/1", so consumers must match by prefix + side, not equality.

Emits mesh_map.json and fails loudly if a muscle_id has no mapping or a mapped
prefix matches nothing in the rig config -- a silent miss here would show up as a
muscle that simply never highlights, which is easy to not notice.
"""
import json
import sys

# muscle_id -> list of mesh-name base prefixes (side suffix appended by the consumer)
MESH_MAP = {
    # --- back
    "latissimus_dorsi": ["Latissimus dorsi muscle"],
    "teres_major": ["Teres major muscle"],
    "teres_minor": ["Teres minor muscle"],
    "trapezius_upper": ["Descending part of trapezius muscle"],
    "trapezius_middle": ["Transverse part of trapezius muscle"],
    "trapezius_lower": ["Ascending part of trapezius muscle"],
    "rhomboids": ["Rhomboid major muscle", "Rhomboid minor muscle"],
    # "erector spinae" is a collective name, not a single Z-Anatomy object: it is
    # modelled as its three component columns (plus the deeper transversospinalis
    # group, included here because the dataset treats erector spinae as the trunk
    # extensor block rather than naming individual columns).
    "erector_spinae": ["Longissimus", "Iliocostalis", "Spinalis",
                       "Multifidus", "Semispinalis"],
    # --- shoulder / rotator cuff
    "deltoid_anterior": ["Clavicular part of deltoid muscle"],
    "deltoid_lateral": ["Acromial part of deltoid muscle"],
    "deltoid_posterior": ["Scapular spinal part of deltoid muscle"],
    "supraspinatus": ["Supraspinatus muscle"],
    "infraspinatus": ["Infraspinatus muscle"],
    # --- arm
    "biceps_brachii": ["Long head of biceps brachii", "Short head of biceps brachii"],
    "triceps_brachii": ["Long head of triceps brachii", "Lateral head of triceps brachii",
                        "Medial head of triceps brachii"],
    # arm group: all three exist as real meshes, so they highlight like any other
    "brachialis": ["Brachialis muscle"],
    "brachioradialis": ["Brachioradialis muscle"],
    "anconeus": ["Anconeus muscle"],
    # --- hip / glute
    "gluteus_maximus": ["Gluteus maximus muscle"],
    "gluteus_medius": ["Gluteus medius muscle"],
    "iliopsoas": ["Psoas major", "Iliacus muscle"],
    "adductor_magnus": ["Adductor magnus"],
    # --- thigh
    "rectus_femoris": ["Rectus femoris muscle"],
    "vastus_muscles": ["Vastus lateralis muscle", "Vastus medialis muscle",
                       "Vastus intermedius muscle"],
    "hamstrings": ["Long head of biceps femoris", "Short head of biceps femoris",
                   "Semitendinosus muscle", "Semimembranosus muscle"],
    # --- core
    "rectus_abdominis": ["Rectus abdominis muscle"],
    "obliques": ["External abdominal oblique muscle", "Internal abdominal oblique muscle"],
    "transversus_abdominis": ["Transversus abdominis muscle"],
    # pectoralis_major is a parent record in the chest dataset; its three heads are
    # the addressable meshes, so the parent maps to all of them.
    "pectoralis_major": ["Clavicular head of pectoralis major muscle",
                         "Sternocostal head of pectoralis major muscle",
                         "(Abdominal part of pectoralis major muscle)"],
    # --- chest (from the v1 pilot, kept so one map covers the whole dataset)
    "pec_major_clavicular": ["Clavicular head of pectoralis major muscle"],
    "pec_major_sternocostal": ["Sternocostal head of pectoralis major muscle"],
    "pec_major_abdominal": ["(Abdominal part of pectoralis major muscle)"],
    "pectoralis_minor": ["Pectoralis minor muscle"],
    "serratus_anterior": ["Serratus anterior muscle"],
}


def main(rig_path, muscles_path, chest_muscles_path, out_path):
    rig = json.load(open(rig_path))
    all_meshes = set()
    for seg in rig["segments"].values():
        all_meshes.update(seg["meshes"])

    wanted = {m["muscle_id"] for m in json.load(open(muscles_path))}
    wanted |= {m["muscle_id"] for m in json.load(open(chest_muscles_path))}

    errors = []

    unmapped = sorted(wanted - set(MESH_MAP))
    if unmapped:
        errors.append(f"muscle_ids with no mesh mapping: {unmapped}")

    dead = {}
    for mid, prefixes in MESH_MAP.items():
        for p in prefixes:
            hits = [n for n in all_meshes if n.startswith(p)]
            if not hits:
                dead.setdefault(mid, []).append(p)
    if dead:
        errors.append(f"mapped prefixes matching no mesh in the asset: {dead}")

    if errors:
        for e in errors:
            print("FAIL " + e)
        return 1

    resolved = {}
    for mid, prefixes in MESH_MAP.items():
        meshes = sorted(n for n in all_meshes
                        if any(n.startswith(p) for p in prefixes))
        resolved[mid] = {"prefixes": prefixes, "meshes": meshes}

    json.dump(resolved, open(out_path, "w"), ensure_ascii=False, indent=2)
    covered = sum(len(v["meshes"]) for v in resolved.values())
    print(f"OK  {len(resolved)} muscle_ids -> {covered} meshes; "
          f"all mapped prefixes resolve, no unmapped muscle_ids")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:5]))
