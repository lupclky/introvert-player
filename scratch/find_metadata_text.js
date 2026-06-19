const fs = require('fs');

try {
    if (fs.existsSync('scratch/home_initial.json')) {
        const data = JSON.parse(fs.readFileSync('scratch/home_initial.json', 'utf8'));
        
        // Find a video lockup
        function findVideoLockup(obj) {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && obj.metadata?.lockupMetadataViewModel) {
                return obj;
            }
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const r = findVideoLockup(item);
                    if (r) return r;
                }
            } else {
                for (const k of Object.keys(obj)) {
                    const r = findVideoLockup(obj[k]);
                    if (r) return r;
                }
            }
            return null;
        }
        
        const videoLockup = findVideoLockup(data);
        if (videoLockup) {
            const m = videoLockup.metadata.lockupMetadataViewModel.metadata;
            console.log("=== VIDEO METADATA ROWS ===");
            console.log(JSON.stringify(m, null, 2));
        } else {
            console.log("No video lockup found");
        }
    }
} catch (e) {
    console.error("Error:", e.message);
}
