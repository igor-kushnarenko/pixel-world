"""Read-only import of the author's PSD layout and original PNGs.

Run with Python + Pillow + psd-tools. Optional local dependencies: .tools/python.
No resampling, retouching, or writes to supplied source files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'python'))
from PIL import Image, ImageChops
from psd_tools import PSDImage

FILES = [
    ('city-far', 'Дальний туманный мегаполис будущего.png'),
    ('city-mid-far', 'Средний дальний.png'),
    ('city-mid-near', 'Средний ближний.png'),
    ('city-near', 'Ближний.png'),
    ('room', 'room.png'),
]
PSD_LAYERS = [
    ('reference-background', 'Белый фон PSD', None, 0.25),
    ('reference-sky', 'Нарисованное небо PSD', None, 0.5),
    ('city-far', 'Дальний туманный мегаполис', FILES[0][1], 20),
    ('city-mid-far', 'Средний дальний', FILES[1][1], 40),
    ('city-mid-near', 'Средний ближний', FILES[2][1], 60),
    ('city-near', 'Ближний', FILES[3][1], 80),
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_copy(source: Path, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    digest = sha(source)
    if sha(destination) != digest:
        raise RuntimeError(f'Copy verification failed: {destination}')
    return digest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--psd', type=Path, required=True)
    parser.add_argument('--png-dir', type=Path, required=True)
    args = parser.parse_args()
    base = ROOT / 'public' / 'assets' / 'nightcity'
    exports = base / 'psd'
    exports.mkdir(parents=True, exist_ok=True)
    psd_digest = checked_copy(args.psd, ROOT / 'assets' / 'source' / 'nightcity.psd')
    originals = []
    for slug, filename in FILES:
        destination = base / 'originals' / f'{slug}.png'
        digest = checked_copy(args.png_dir / filename, destination)
        with Image.open(destination) as image:
            alpha = image.convert('RGBA').getchannel('A').histogram()
            originals.append({
                'id': slug, 'originalName': filename,
                'file': f'originals/{slug}.png', 'sha256': digest,
                'width': image.width, 'height': image.height,
                'transparentPixels': alpha[0], 'partialAlphaPixels': sum(alpha[1:255]),
                'opaquePixels': alpha[255],
            })

    psd = PSDImage.open(args.psd)
    layers = list(psd)
    if len(layers) != len(PSD_LAYERS) or any(layer.kind != 'pixel' for layer in layers):
        raise ValueError('PSD structure changed; review the layer mapping before importing')
    manifest = {
        'version': 1, 'width': psd.width, 'height': psd.height,
        'sourcePsd': {'file': 'assets/source/nightcity.psd', 'sha256': psd_digest},
        'originals': originals, 'layersBottomToTop': [],
        'roomPlacement': 'pending: room PNG is not present in the PSD',
    }
    composite = Image.new('RGBA', psd.size)
    for layer, (slug, label, original_name, depth) in zip(layers, PSD_LAYERS):
        if layer.has_mask() or layer.opacity != 255 or layer.blend_mode.value != b'norm':
            raise ValueError(f'Unsupported compositing state: {layer.name}')
        image = layer.topil().convert('RGBA')
        full = Image.new('RGBA', psd.size)
        # Paste raw RGBA, without an extra alpha mask (which would multiply alpha twice).
        # Pillow clips only to the PSD viewport; layer pixels are never resampled.
        full.paste(image, (layer.left, layer.top))
        destination = exports / f'{slug}.png'
        full.save(destination)
        composite = Image.alpha_composite(composite, full)
        manifest['layersBottomToTop'].append({
            'id': slug, 'label': label, 'psdName': layer.name,
            'originalName': original_name, 'bbox': list(layer.bbox),
            'opacity': layer.opacity, 'visible': layer.visible,
            'blendMode': 'normal', 'depth': depth,
            'file': f'psd/{slug}.png', 'sha256': sha(destination),
            'runtimeX': 0, 'runtimeY': 0,
        })
    # Author's stored merged preview is retained for visual reference.
    reference = psd.topil().convert('RGBA')
    reference.save(base / 'reference-psd.png')
    composite.save(ROOT / 'artifacts' / 'nightcity-layer-composite.png')
    difference = ImageChops.difference(reference.convert('RGB'), composite.convert('RGB'))
    max_difference = max(high for low, high in difference.getextrema())
    verification = {
        'width': psd.width, 'height': psd.height,
        'reference': 'public/assets/nightcity/reference-psd.png',
        'reconstructed': 'artifacts/nightcity-layer-composite.png',
        'maxChannelDifference': max_difference,
        'pixelExact': max_difference == 0,
        'sourcePsdSha256': psd_digest,
    }
    (ROOT / 'artifacts' / 'psd-import-report.json').write_text(json.dumps(verification, indent=2) + '\n', encoding='utf-8')
    if max_difference:
        raise RuntimeError('Exported layer composition differs from the stored PSD preview; inspect before integration')
    (base / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if sha(args.psd) != psd_digest:
        raise RuntimeError('Source PSD changed during import')
    print(f'Imported {len(originals)} original PNGs and {len(layers)} PSD layers at {psd.width}x{psd.height}.')
    print('All source hashes verified. Room placement remains separate from PSD city layout.')


if __name__ == '__main__':
    main()
