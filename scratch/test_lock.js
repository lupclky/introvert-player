const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist-installer');

function checkLocks(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} does not exist.`);
        return;
    }
    
    function recurse(currentPath) {
        const stat = fs.lstatSync(currentPath);
        if (stat.isDirectory()) {
            const files = fs.readdirSync(currentPath);
            for (const file of files) {
                recurse(path.join(currentPath, file));
            }
        } else {
            try {
                // Try to open file in read/write mode
                const fd = fs.openSync(currentPath, 'r+');
                fs.closeSync(fd);
            } catch (e) {
                console.log(`LOCKED: ${currentPath} - Error: ${e.code} (${e.message})`);
            }
        }
    }
    
    recurse(dir);
    console.log("Check complete.");
}

checkLocks(distDir);
