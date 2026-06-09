const { execSync } = require('child_process');

try {
    console.log("Listing processes...");
    const output = execSync('wmic process get processid,name,executablepath', { encoding: 'utf8' });
    const lines = output.split('\n');
    const myPid = process.pid;
    
    console.log(`Current PID: ${myPid}`);
    
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('node.exe') || lower.includes('chrome.exe') || lower.includes('chromium.exe') || lower.includes('electron.exe') || lower.includes('duacornerplayer')) {
            // Extract PID
            const match = line.match(/(\d+)\s*$/);
            if (match) {
                const pid = parseInt(match[1]);
                if (pid !== myPid) {
                    console.log(`Killing PID ${pid}: ${line.trim()}`);
                    try {
                        execSync(`taskkill /f /pid ${pid}`);
                        console.log(`Killed ${pid}`);
                    } catch (e) {
                        console.error(`Failed to kill ${pid}: ${e.message}`);
                    }
                }
            }
        }
    }
    console.log("Finished killing processes.");
} catch (err) {
    console.error("Error:", err);
}
