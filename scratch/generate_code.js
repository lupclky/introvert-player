const crypto = require('crypto');

// Phải trùng với key trong app.js
const SECRET_KEY = 'pineapple-studio-secret-key-2026';

function generateCode(amount) {
    const nonce = crypto.randomBytes(8).toString('hex').toUpperCase();
    const rawString = `${amount}-${nonce}-${SECRET_KEY}`;
    const sig = crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 12).toUpperCase();
    return `ADD-${amount}-${nonce}-${sig}`;
}

// Nhận tham số amount từ dòng lệnh
const args = process.argv.slice(2);
const amount = parseInt(args[0], 10) || 10; // Mặc định là 10 lượt

const code = generateCode(amount);
console.log(`\n=============================================`);
console.log(`   MÃ KÍCH HOẠT LƯỢT THAO TÁC MỚI`);
console.log(`=============================================`);
console.log(` Số lượt: ${amount}`);
console.log(` Mã Code: ${code}`);
console.log(`=============================================\n`);
