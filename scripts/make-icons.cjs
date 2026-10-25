// Generate all browser icons from the header's California mark.
// Requires the authoring dependency sharp (available in the Codex bundled runtime).
// Run: NODE_PATH=/path/to/node_modules node scripts/make-icons.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const mark = await fs.readFile(path.join(root, 'public/images/california-outline.svg'), 'utf8');
  const artwork = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" role="img" aria-label="The California Civic Dashboard">
  <title>The California Civic Dashboard</title>
  <rect width="112" height="112" rx="22" fill="#2e3b1c"/>
  <g transform="translate(11.85 6)">${artwork}</g>
</svg>\n`;
  await fs.writeFile(path.join(root, 'public/img/logo.svg'), svg);
  for (const size of [32, 180]) {
    const dest = path.join(root, `public/img/icon-${size}.png`);
    await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(dest);
    console.log(`Generated ${size} × ${size} icon`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
