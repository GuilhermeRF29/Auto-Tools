const fs = require('fs');
const path = require('path');

const root = __dirname;
let count = 0;
const w = fs.watch(root, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.includes('node_modules') && !filename.includes('.git') && !filename.includes('watch.js')) {
        console.log(`[WATCH] Event: ${eventType} on ${filename}`);
        count++;
        if (count > 20) {
            process.exit(0);
        }
    }
});

console.log('Watching for file changes for 15 seconds...');
setTimeout(() => {
    console.log('Done watching.');
    process.exit(0);
}, 15000);
