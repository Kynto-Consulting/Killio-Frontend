const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generate() {
  const input = path.join(__dirname, '../public/killio.webp');
  const outDir = path.join(__dirname, '../public');
  
  if (!fs.existsSync(input)) {
    console.error('killio.webp not found');
    return;
  }
  
  try {
    // 192x192
    await sharp(input)
      .resize(192, 192, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
      .toFile(path.join(outDir, 'icon-192.png'));
      
    // 512x512
    await sharp(input)
      .resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
      .toFile(path.join(outDir, 'icon-512.png'));
      
    // apple-icon (180x180)
    await sharp(input)
      .resize(180, 180, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
      .toFile(path.join(outDir, 'apple-icon.png'));
      
    // favicon (32x32)
    await sharp(input)
      .resize(32, 32, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
      .toFile(path.join(outDir, 'favicon.ico'));
      
    console.log('? Icons generated successfully!');
  } catch(err) {
    console.error('Error generating icons:', err);
  }
}

generate();

