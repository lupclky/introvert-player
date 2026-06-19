const fs = require('fs');

const css = fs.readFileSync('styles.css', 'utf8');

const regex = /([^{]+)\{[^}]+display\s*:\s*(grid|flex)[^}]*\}/gi;
let match;
while ((match = regex.exec(css)) !== null) {
    console.log("Selector:", match[1].trim());
}
