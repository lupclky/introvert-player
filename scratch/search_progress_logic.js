const fs = require('fs');
const content = fs.readFileSync('overlay.html', 'utf8');
const lines = content.split('\n');

console.log("--- Searching progress bar elements & logic in overlay.html ---");
lines.forEach((line, idx) => {
    if (line.includes('progress-bar') || line.includes('updateProgress') || line.includes('progressInterval') || line.includes('livePlayTime') || line.includes('liveTick')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
