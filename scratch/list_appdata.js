const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA;
console.log("APPDATA Path:", appData);

try {
    const list = fs.readdirSync(appData);
    const matches = list.filter(name => name.toLowerCase().includes('introvert') || name.toLowerCase().includes('player') || name.toLowerCase().includes('dua'));
    console.log("Matching directories:", matches);
} catch (e) {
    console.error("Error listing APPDATA:", e.message);
}
