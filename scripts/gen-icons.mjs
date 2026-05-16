import sharp from "sharp";
import { writeFileSync } from "fs";

// Generate PNG buffers at multiple sizes
const [png32, png180, png192, png512] = await Promise.all([
  sharp("./public/logo/piloti-icon-clean.svg").resize(32, 32).png().toBuffer(),
  sharp("./public/logo/piloti-icon-clean.svg").resize(180, 180).png().toBuffer(),
  sharp("./public/logo/piloti-icon-clean.svg").resize(192, 192).png().toBuffer(),
  sharp("./public/logo/piloti-icon-clean.svg").resize(512, 512).png().toBuffer(),
]);

// Write standard PNGs
writeFileSync("./src/app/icon.png", png32);
writeFileSync("./public/icons/apple-touch-icon.png", png180);
writeFileSync("./public/icons/icon-192.png", png192);
writeFileSync("./public/icons/icon-512.png", png512);

// Build a minimal multi-size ICO (16x16 + 32x32 + 48x48) for favicon.ico
// ICO format: ICONDIR (6 bytes) + N×ICONDIRENTRY (16 bytes each) + image data
const sizes = [16, 32, 48];
const pngBuffers = await Promise.all(
  sizes.map((s) =>
    sharp("./public/logo/piloti-icon-clean.svg").resize(s, s).png().toBuffer(),
  ),
);

const count = sizes.length;
const headerSize = 6 + count * 16;
let offset = headerSize;

const icondir = Buffer.alloc(6);
icondir.writeUInt16LE(0, 0); // reserved
icondir.writeUInt16LE(1, 2); // type: ICO
icondir.writeUInt16LE(count, 4);

const entries = pngBuffers.map((buf, i) => {
  const e = Buffer.alloc(16);
  const sz = sizes[i];
  e.writeUInt8(sz === 256 ? 0 : sz, 0); // width (0 = 256)
  e.writeUInt8(sz === 256 ? 0 : sz, 1); // height
  e.writeUInt8(0, 2);                   // color count
  e.writeUInt8(0, 3);                   // reserved
  e.writeUInt16LE(1, 4);                // planes
  e.writeUInt16LE(32, 6);               // bit count
  e.writeUInt32LE(buf.length, 8);       // size of image data
  e.writeUInt32LE(offset, 12);          // offset
  offset += buf.length;
  return e;
});

const icoBuffer = Buffer.concat([icondir, ...entries, ...pngBuffers]);
writeFileSync("./src/app/favicon.ico", icoBuffer);

console.log("All icons generated.");
