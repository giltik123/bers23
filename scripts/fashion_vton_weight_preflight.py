#!/usr/bin/env python3
"""R&D only: byte-verify locally prepared FASHN/DWPose weights before inference.

A caller-supplied manifest is NOT a production admission or a signature.
An authorized reviewer must pin and separately attest the source of its hashes.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path

REQUIRED_FILES = (
    'model.safetensors',
    'dwpose/yolox_l.onnx',
    'dwpose/dw-ll_ucoco_384.onnx',
)
SCHEMA = 'BERS_FASHION_RESEARCH_WEIGHTS_V1'


def verify_weights(root: Path, manifest_path: Path) -> dict:
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Local weights directory must be a regular directory')
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError('Local manifest file must be a regular file')
    if manifest_path.stat().st_size > 4096:
        raise ValueError('Manifest exceeds size limit')
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('Malformed weight manifest') from exc
    if not isinstance(manifest, dict) or set(manifest) != {'schema', 'files'} or manifest['schema'] != SCHEMA:
        raise ValueError('Unsupported weight manifest schema')
    specs = manifest['files']
    if not isinstance(specs, dict) or set(specs) != set(REQUIRED_FILES):
        raise ValueError('Manifest must bind precisely the three required files')
    total_bytes = 0
    for name in REQUIRED_FILES:
        spec = specs[name]
        if not isinstance(spec, dict) or set(spec) != {'bytes', 'sha256'}:
            raise ValueError(f'Invalid weight identity for {name}')
        size, sha = spec['bytes'], spec['sha256']
        if type(size) is not int or size <= 0 or size > 20 * 1024**3:
            raise ValueError(f'Invalid weight size for {name}')
        if not isinstance(sha, str) or not re.fullmatch(r'[a-f0-9]{64}', sha):
            raise ValueError(f'Invalid weight SHA-256 for {name}')
        file_path = root.joinpath(*name.split('/'))
        parent = file_path.parent
        while parent != root:
            if parent.is_symlink():
                raise ValueError(f'Symlink in weights directory for {name}')
            parent = parent.parent
        if file_path.is_symlink() or not file_path.is_file():
            raise ValueError(f'Missing regular weight file: {name}')
        if file_path.stat().st_size != size:
            raise ValueError(f'Weight size mismatch: {name}')
        digest = hashlib.sha256()
        with file_path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() != sha:
            raise ValueError(f'Weight SHA-256 mismatch: {name}')
        total_bytes += size
    return {'filesVerified': len(REQUIRED_FILES), 'totalBytes': total_bytes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--weights-dir', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(verify_weights(args.weights_dir, args.manifest), sort_keys=True))


if __name__ == '__main__':
    main()
