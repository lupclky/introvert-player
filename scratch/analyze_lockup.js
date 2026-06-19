const fs = require('fs');

function findKeysRecursive(obj, keys, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            findKeysRecursive(item, keys, results);
        }
    } else {
        for (const k of Object.keys(obj)) {
            if (keys.includes(k)) {
                results.push({ key: k, value: obj[k] });
            }
            findKeysRecursive(obj[k], keys, results);
        }
    }
    return results;
}

try {
    if (fs.existsSync('scratch/home_initial.json')) {
        const data = JSON.parse(fs.readFileSync('scratch/home_initial.json', 'utf8'));
        const results = findKeysRecursive(data, ['lockupViewModel']);
        console.log("=== HOME FEED LOCKUP VIEW MODEL EXAMPLES ===");
        if (results.length > 0) {
            console.log(JSON.stringify(results[0].value, null, 2));
            console.log("\nSecond one:");
            if (results.length > 1) {
                console.log(JSON.stringify(results[1].value, null, 2));
            }
        }
    }
    
    if (fs.existsSync('scratch/playlists_initial.json')) {
        const data = JSON.parse(fs.readFileSync('scratch/playlists_initial.json', 'utf8'));
        const results = findKeysRecursive(data, ['lockupViewModel']);
        console.log("\n=== PLAYLIST FEED LOCKUP VIEW MODEL EXAMPLES ===");
        if (results.length > 0) {
            console.log(JSON.stringify(results[0].value, null, 2));
        }
    }
} catch (e) {
    console.error("Error:", e.message);
}
