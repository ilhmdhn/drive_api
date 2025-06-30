const sqlz = require('./src/tools/db');

async function testConnection() {
    try {
        await sqlz.authenticate();
        console.log('Koneksi berhasil!');
    } catch (error) {
        console.error('Gagal koneksi ke database:', error);
    }
}

testConnection();