const fs = require('fs');
const path = require('path');

const paths = [
    path.join(process.env.APPDATA, 'introvert-player'),
    path.join(process.env.APPDATA, 'dua-corner-player')
];

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            return;
        }
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else {
            if (file.toLowerCase().includes('cookie')) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

paths.forEach(p => {
    console.log("Checking path:", p);
    try {
        const cookieFiles = walk(p);
        console.log(`Found Cookie Files in ${path.basename(p)}:`, cookieFiles);
    } catch (e) {
        console.error("Error:", e.message);
    }
});
