const { glob } = require('glob');
const { dirname, basename } = require('node:path');
const { mkdirSync, copyFileSync } = require('node:fs');

const args = process.argv;
let levelsToRemove;
if (args.length !== 5 || isNaN((levelsToRemove = Number(args[2]))) || levelsToRemove < 0 || levelsToRemove % 1 !== 0) {
    console.log('Usage: node copyfiles.js <levels-to-remove> <source-glob> <destination>');
    process.exit(1);
}

const sourceGlob = args[3];
const destination = args[4];

(async () => {
    const paths = await glob(sourceGlob, { posix: true, nodir: true });
    for (const p of paths) {
        const relDest = p.split('/').slice(levelsToRemove).join('/');
        const destDir = `${destination}/${dirname(relDest)}`;
        mkdirSync(destDir, { recursive: true });
        const destFile = `${destDir}/${basename(relDest)}`;
        console.log(`Copy ${p} to ${destFile}`);
        copyFileSync(p, destFile);
    }
})();
