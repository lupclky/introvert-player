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
        const videoLockup = results.find(r => r.value.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO');
        if (videoLockup) {
            console.log(JSON.stringify(videoLockup.value.metadata.lockupMetadataViewModel, null, 2));
        }
    }
} catch (e) {
    console.error("Error:", e.message);
}
