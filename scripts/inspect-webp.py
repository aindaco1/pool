#!/usr/bin/env python3
"""Decode every WebP frame with libwebp, including composited animation frames."""

import hashlib
import json
import sys

from PIL import Image


def inspect_webp(filename):
    with Image.open(filename) as image:
        if image.format != "WEBP":
            raise ValueError("Expected a WebP image")
        width, height = image.size
        # Orientation changes displayed pixels even when stored RGBA is identical.
        orientation = image.getexif().get(274, 1)
        digest = hashlib.sha256()
        timeline = []
        elapsed = 0
        for frame in range(image.n_frames):
            image.seek(frame)
            image.load()  # libwebp validates and composites the complete frame.
            duration = image.info.get("duration", 40) if image.n_frames > 1 else 40
            if not isinstance(duration, int) or duration < 0:
                raise ValueError("Invalid WebP frame duration")
            timeline.append([elapsed, duration * 1000])
            digest.update(json.dumps([width, height, orientation, elapsed, duration]).encode())
            digest.update(image.convert("RGBA").tobytes())
            elapsed += duration * 1000
        return {"width": width, "height": height, "frames": digest.hexdigest(), "timeline": timeline}


if __name__ == "__main__":
    print(json.dumps(inspect_webp(sys.argv[1])))
