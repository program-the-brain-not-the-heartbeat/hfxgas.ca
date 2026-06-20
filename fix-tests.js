const fs = require('fs');
let c = fs.readFileSync('test/index.test.js', 'utf8');
c = c.replace(/\bSELF\.fetch\b/g, 'workerExports.default.fetch');
c = c.replace('Routes via SELF.fetch', 'Routes via workerExports.default.fetch');
fs.writeFileSync('test/index.test.js', c);
console.log('done');
