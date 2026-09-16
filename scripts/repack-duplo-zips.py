#!/usr/bin/env python3
"""Rinomina DupFinder.exe / DupFinder in DUPLO dentro gli zip della release."""
import shutil
import zipfile
from pathlib import Path

MAPPING = {
    "DUPLO-1.0.0-win.zip": "DUPLO.exe",
    "DUPLO-1.0.0-ia32-win.zip": "DUPLO.exe",
    "DUPLO-linux-x64.zip": "DUPLO",
}


def rename_tree(root: Path) -> None:
    for path in sorted(root.rglob("*"), key=lambda item: len(str(item)), reverse=True):
        new_name = path.name.replace("DupFinder", "DUPLO").replace("dupfinder", "duplo")
        if new_name != path.name:
            path.rename(path.with_name(new_name))


def repack(zip_name: str, expected: str) -> None:
    src = Path(zip_name)
    unpacked = Path("unpacked-" + zip_name)
    if unpacked.exists():
        shutil.rmtree(unpacked)
    unpacked.mkdir()
    with zipfile.ZipFile(src) as archive:
        archive.extractall(unpacked)
    rename_tree(unpacked)
    names = [path.name for path in unpacked.rglob("*") if path.is_file()]
    leftover = [name for name in names if "dupfinder" in name.lower()]
    if leftover:
        raise SystemExit(f"ancora DupFinder in {zip_name}: {leftover}")
    if expected not in names:
        raise SystemExit(f"{zip_name} senza {expected}: {names[:40]}")
    tmp = Path(zip_name + ".new")
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in unpacked.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(unpacked).as_posix())
    tmp.replace(src)
    print("OK", zip_name, "->", expected)


def main() -> None:
    for zip_name, expected in MAPPING.items():
        repack(zip_name, expected)


if __name__ == "__main__":
    main()
