const { execSync } = require('child_process');

try {
    console.log("Listing processes via tasklist...");
    const output = execSync('wmic process get processid,name,executablepath', { encoding: 'utf8' });
    const lines = output.split('\n');
    console.log("Processes running from D:\\zypage_player:");
    let found = false;
    for (const line of lines) {
        if (line.toLowerCase().includes('zypage_player')) {
            console.log(line.trim());
            found = true;
            // Extract PID
            const match = line.match(/(\d+)\s*$/);
            if (match) {
                const pid = match[1];
                console.log(`Killing PID: ${pid}`);
                try {
                    execSync(`taskkill /f /pid ${pid}`);
                    console.log(`Successfully killed PID: ${pid}`);
                } catch (e) {
                    console.error(`Failed to kill PID: ${pid}`, e.message);
                }
            }
        }
    }
    if (!found) {
        console.log("No processes found running from D:\\zypage_player.");
    }
} catch (err) {
    console.error("Error running wmic:", err);
}
