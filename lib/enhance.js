/**
 * Image enhancement pipeline using Sharp
 *
 * Applies subtle adjustments to make each download unique:
 * - Slight crop + resize back to original dimensions
 * - Hue/saturation/brightness shifts
 * - Gamma correction
 * - Minor noise overlay
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const ENHANCE = {
    cropMin: 0.02,
    cropMax: 0.04,
    hueShiftMax: 3,
    saturationRange: [0.97, 1.03],
    gammaRange: [0.97, 1.03],
    brightnessRange: [0.98, 1.02],
    noiseLevel: 2,
    jpegQuality: 93,
};

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export async function enhanceImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return filePath;

    const image = sharp(filePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // 1) Smart crop: slight trim then resize back
    const cropRatio = rand(ENHANCE.cropMin, ENHANCE.cropMax);
    const cropX = Math.floor(width * cropRatio * Math.random());
    const cropY = Math.floor(height * cropRatio * Math.random());
    const cropW = Math.floor(width * (1 - cropRatio));
    const cropH = Math.floor(height * (1 - cropRatio));

    // 2) Color adjustments
    const saturation = rand(...ENHANCE.saturationRange);
    const brightness = rand(...ENHANCE.brightnessRange);
    const hue = Math.round(rand(-ENHANCE.hueShiftMax, ENHANCE.hueShiftMax));
    const gamma = rand(...ENHANCE.gammaRange);

    let pipeline = sharp(filePath)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .resize(width, height)
        .modulate({ saturation, brightness, hue })
        .gamma(gamma);

    // 3) Add subtle noise via composite
    if (ENHANCE.noiseLevel > 0) {
        const noiseBuffer = await generateNoise(width, height, ENHANCE.noiseLevel);
        pipeline = pipeline.composite([{
            input: noiseBuffer,
            blend: 'soft-light',
        }]);
    }

    // 4) Output
    const enhancedPath = filePath.replace(/(\.\w+)$/, `_enhanced$1`);

    if (ext === '.png') {
        await pipeline.png().toFile(enhancedPath);
    } else {
        await pipeline.jpeg({ quality: ENHANCE.jpegQuality }).toFile(enhancedPath);
    }

    // Replace original with enhanced
    await fs.rename(enhancedPath, filePath);
    return filePath;
}

async function generateNoise(width, height, level) {
    const channels = 3;
    const pixels = width * height * channels;
    const buf = Buffer.alloc(pixels);

    for (let i = 0; i < pixels; i++) {
        buf[i] = 128 + randInt(-level, level);
    }

    return sharp(buf, { raw: { width, height, channels } })
        .png()
        .toBuffer();
}
