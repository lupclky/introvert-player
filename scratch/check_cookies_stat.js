const fs = require('fs');
const path = require('path');

const files = [
    'C:\\Users\\Admin\\AppData\\Roaming\\introvert-player\\Network\\Cookies',
    'C:\\Users\\Admin\\AppData\\Roaming\\dua-corner-player\\Network\\Cookies'
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        const stat = fs.statSync(f);
        console.log(`${f}: mtime = ${stat.mtime}`);
    } else {
        console.log(`${f} does not exist`);
    }
});
