const { execSync } = require('child_process');

try {
    const output = execSync('tasklist', { encoding: 'utf8' });
    const lines = output.split('\n');
    console.log("Checking tasklist for suspicious processes:");
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('player') || lower.includes('dua') || lower.includes('electron') || lower.includes('asar')) {
            console.log(line.trim());
        }
    }
} catch (e) {
    console.error(e);
}
