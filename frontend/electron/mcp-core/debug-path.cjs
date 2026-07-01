const path = require('path');
const fs = require('fs');

// 模拟 process.env.SYNKORD_HOME 实际值（单反斜杠）
const homeRaw = 'C:\\Users\\fengwei\\AppData\\Local\\Temp\\synkord-test-path';
console.log('homeRaw =', homeRaw);
console.log('homeRaw length =', homeRaw.length);

// path.join 后
const fp1 = path.join(homeRaw, 'user-auth.json');
console.log('path.join =', fp1);

// 用 path.resolve
const fp2 = path.resolve(homeRaw, 'user-auth.json');
console.log('path.resolve =', fp2);

// 实际文件存在？
fs.mkdirSync(homeRaw, { recursive: true });
fs.writeFileSync(path.join(homeRaw, 'user-auth.json'), '{"test":1}');
console.log('exists raw:', fs.existsSync(homeRaw + '\\user-auth.json'));
console.log('exists joined:', fs.existsSync(fp1));
console.log('exists resolved:', fs.existsSync(fp2));
