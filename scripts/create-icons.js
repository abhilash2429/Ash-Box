'use strict';

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

function createIconPng(size) {
  const png = require('pngjs').PNG;
  const image = new png({ width: size, height: size });

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (dist < radius) {
        const gradient = (radius - dist) / radius;
        image.data[idx] = Math.floor(46 + (95 - 46) * gradient);
        image.data[idx + 1] = Math.floor(170 + (213 - 170) * gradient);
        image.data[idx + 2] = Math.floor(220 + (255 - 220) * gradient);
        image.data[idx + 3] = 255;
      } else if (dist < radius + 2) {
        image.data[idx] = 46;
        image.data[idx + 1] = 170;
        image.data[idx + 2] = 220;
        image.data[idx + 3] = Math.floor(255 * (1 - (dist - radius) / 2));
      } else {
        image.data[idx] = 0;
        image.data[idx + 1] = 0;
        image.data[idx + 2] = 0;
        image.data[idx + 3] = 0;
      }
    }
  }

  return png.sync.write(image);
}

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

try {
  sizes.forEach(size => {
    const buffer = createIconPng(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png`);
  });
  console.log('All icons created successfully');
} catch (e) {
  console.log('Note: Run "npm install pngjs" first, or create icons manually');
  console.log('Creating placeholder SVG files instead...');

  sizes.forEach(size => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.4}" fill="#2eaadc"/>
</svg>`;
    fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
    console.log(`Created icon${size}.svg`);
  });
}
