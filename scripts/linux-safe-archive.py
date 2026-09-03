#!/usr/bin/env python3
"""Create Linux-safe zip and tar.gz with forward slashes and sane permissions."""
from __future__ import annotations

import argparse
import os
import tarfile
import zipfile
from pathlib import Path


def iter_files(source: Path):
    for root, dirs, files in os.walk(source):
        dirs.sort()
        files.sort()
        root_path = Path(root)
        for name in files:
            full = root_path / name
            rel = full.relative_to(source).as_posix()
            yield full, rel


def add_to_zip(zf: zipfile.ZipFile, source: Path) -> None:
    for full, rel in iter_files(source):
        info = zipfile.ZipInfo(rel)
        mode = 0o755 if full.is_dir() else (0o100755 if os.access(full, os.X_OK) else 0o100644)
        info.external_attr = mode << 16
        zf.writestr(info, full.read_bytes())


def add_to_tar(tf: tarfile.TarFile, source: Path) -> None:
    for full, rel in iter_files(source):
        mode = 0o755 if os.access(full, os.X_OK) else 0o644
        ti = tf.gettarinfo(full, arcname=rel)
        ti.mode = mode
        with full.open('rb') as fh:
            tf.addfile(ti, fh)


def main() -> None:
    parser = argparse.ArgumentParser(description='Linux-safe zip/tar.gz builder')
    parser.add_argument('source', help='Directory to archive')
    parser.add_argument('--zip', dest='zip_path', help='Output .zip path')
    parser.add_argument('--tar', dest='tar_path', help='Output .tar.gz path')
    args = parser.parse_args()

    source = Path(args.source).resolve()
    if not source.is_dir():
        raise SystemExit(f'Not a directory: {source}')

    if args.zip_path:
        zip_path = Path(args.zip_path)
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            add_to_zip(zf, source)
        print(f'zip: {zip_path} ({zip_path.stat().st_size} bytes)')

    if args.tar_path:
        tar_path = Path(args.tar_path)
        tar_path.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(tar_path, 'w:gz') as tf:
            add_to_tar(tf, source)
        print(f'tar: {tar_path} ({tar_path.stat().st_size} bytes)')

    if not args.zip_path and not args.tar_path:
        raise SystemExit('Provide --zip and/or --tar')


if __name__ == '__main__':
    main()
