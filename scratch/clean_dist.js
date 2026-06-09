const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist-installer');

function makeWritableAndRemove(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} does not exist.`);
        return;
    }
    
    console.log(`Clearing read-only flags and deleting contents of ${dir}...`);
    
    function recurse(currentPath) {
        const stat = fs.lstatSync(currentPath);
        
        // Remove read-only attribute
        try {
            fs.chmodSync(currentPath, 0o666);
        } catch (e) {
            console.error(`Failed to chmod ${currentPath}:`, e.message);
        }
        
        if (stat.isDirectory()) {
            const files = fs.readdirSync(currentPath);
            for (const file of files) {
                recurse(path.join(currentPath, file));
            }
            try {
                fs.rmdirSync(currentPath);
            } catch (e) {
                console.error(`Failed to rmdir ${currentPath}:`, e.message);
            }
        } else {
            try {
                fs.unlinkSync(currentPath);
            } catch (e) {
                console.error(`Failed to unlink ${currentPath}:`, e.message);
            }
        }
    }
    
    recurse(dir);
    console.log("Cleanup complete!");
}

makeWritableAndRemove(distDir);
