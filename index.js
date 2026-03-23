#!/usr/bin/env node

/**
 * Threads Media Downloader & Enhancer
 *
 * Usage:
 *   node index.js <threads-url> [--output <dir>] [--no-enhance]
 *   node index.js https://www.threads.net/@user/post/ABC123
 */

import { fetchThreadsMedia } from './lib/scraper.js';
import { enhanceImage } from './lib/enhance.js';
import { downloadMedia } from './lib/download.js';
import { parseArgs, printHelp } from './lib/cli.js';

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || !args.url) {
        printHelp();
        process.exit(args.help ? 0 : 1);
    }

    console.log(`[TMD] Fetching media from: ${args.url}`);
    const mediaUrls = await fetchThreadsMedia(args.url);

    if (mediaUrls.length === 0) {
        console.log('[TMD] No media found.');
        process.exit(0);
    }

    console.log(`[TMD] Found ${mediaUrls.length} media item(s)`);

    for (const media of mediaUrls) {
        const filePath = await downloadMedia(media.url, media.type, args.output);

        if (!args.noEnhance && media.type === 'image') {
            const enhanced = await enhanceImage(filePath);
            console.log(`[TMD] Enhanced: ${enhanced}`);
        } else {
            console.log(`[TMD] Saved: ${filePath}`);
        }
    }

    console.log('[TMD] Done.');
}

main().catch(err => {
    console.error('[TMD] Error:', err.message);
    process.exit(1);
});
