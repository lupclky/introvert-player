const fs = require('fs');

function findKeysRecursive(obj, keys, path = '', results = []) {
    if (!obj || typeof obj !== 'object') return results;
    
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            findKeysRecursive(item, keys, `${path}[${index}]`, results);
        });
    } else {
        Object.keys(obj).forEach(k => {
            const currentPath = path ? `${path}.${k}` : k;
            if (keys.includes(k)) {
                results.push({ key: k, value: obj[k], path: currentPath });
            }
            findKeysRecursive(obj[k], keys, currentPath, results);
        });
    }
    return results;
}

try {
    if (fs.existsSync('scratch/playlists_initial.json')) {
        const playlists = JSON.parse(fs.readFileSync('scratch/playlists_initial.json', 'utf8'));
        console.log("--- Playlists Initial Data Analysis ---");
        
        // Find some common keys to see what we have
        const keysToFind = ['playlistId', 'playlistRenderer', 'gridPlaylistRenderer', 'lockupViewModel', 'playlistId'];
        const results = findKeysRecursive(playlists, keysToFind);
        console.log(`Found ${results.length} occurrences of target keys:`);
        results.slice(0, 15).forEach(r => {
            console.log(`- Key: ${r.key}, Path: ${r.path}`);
            if (r.key === 'playlistId') console.log(`  Value: ${r.value}`);
            if (r.key === 'playlistRenderer' || r.key === 'gridPlaylistRenderer' || r.key === 'lockupViewModel') {
                console.log(`  Keys: ${Object.keys(r.value || {}).join(', ')}`);
                if (r.value.title) console.log(`  Title:`, JSON.stringify(r.value.title));
            }
        });
    } else {
        console.log("scratch/playlists_initial.json does not exist");
    }

    if (fs.existsSync('scratch/home_initial.json')) {
        const home = JSON.parse(fs.readFileSync('scratch/home_initial.json', 'utf8'));
        console.log("\n--- Home Feed Initial Data Analysis ---");
        
        const keysToFind = ['videoId', 'videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer', 'richItemRenderer', 'richVideoContent'];
        const results = findKeysRecursive(home, keysToFind);
        console.log(`Found ${results.length} occurrences of target keys:`);
        results.slice(0, 15).forEach(r => {
            console.log(`- Key: ${r.key}, Path: ${r.path}`);
            if (r.key === 'videoId') console.log(`  Value: ${r.value}`);
            if (r.key === 'videoRenderer') {
                console.log(`  Keys: ${Object.keys(r.value || {}).join(', ')}`);
                if (r.value.title) console.log(`  Title:`, JSON.stringify(r.value.title));
            }
        });
    } else {
        console.log("scratch/home_initial.json does not exist");
    }
} catch (e) {
    console.error("Error analyzing JSON:", e.message);
}
