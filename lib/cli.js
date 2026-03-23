/**
 * CLI argument parser
 */

export function parseArgs(argv) {
    const args = { url: null, output: './downloads', noEnhance: false, help: false };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--no-enhance') args.noEnhance = true;
        else if ((arg === '--output' || arg === '-o') && argv[i + 1]) args.output = argv[++i];
        else if (!arg.startsWith('-')) args.url = arg;
    }

    return args;
}

export function printHelp() {
    console.log(`
Threads Media Downloader & Enhancer

Usage:
  node index.js <threads-url> [options]

Options:
  --output, -o <dir>   Output directory (default: ./downloads)
  --no-enhance         Skip image enhancement, save originals
  --help, -h           Show this help

Examples:
  node index.js https://www.threads.net/@user/post/ABC123
  node index.js https://www.threads.net/@user/post/ABC123 -o ./media --no-enhance
`.trim());
}
