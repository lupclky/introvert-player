const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');

console.log("Starting manual electron extraction...");
downloadArtifact({ version: '42.3.3', artifactName: 'electron' })
  .then(zipPath => {
    console.log('Artifact located at:', zipPath);
    const dest = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
    const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');
    console.log('Target dist directory:', dest);
    console.log('Target path.txt path:', pathTxt);
    
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    return extract(zipPath, { dir: dest }).then(() => {
      fs.writeFileSync(pathTxt, 'electron.exe', 'utf8');
      console.log('Extraction and path.txt creation completed successfully!');
    });
  })
  .catch(err => {
    console.error('An error occurred during extraction:', err);
  });
