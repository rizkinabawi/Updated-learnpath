/**
 * sync-dictionary.mjs
 * 
 * Skrip untuk mendownload dan mengintegrasikan kamus bahasa Jepang (JLPT N1-N5)
 * ke dalam aplikasi secara otomatis.
 */

import fs from 'fs';
import https from 'https';
import path from 'path';

const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
const BASE_URL = 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/json/';
const OUTPUT_PATH = './artifacts/mobile/assets/dictionary-full.json';

console.log('⏳ Memulai sinkronisasi kamus JLPT (N1-N5)...');

const download = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Gagal download: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Gagal parse JSON dari ${url}`));
        }
      });
    }).on('error', (err) => reject(err));
  });
};

async function sync() {
  try {
    let combined = [];
    
    for (const level of LEVELS) {
      console.log(`🌐 Mendownload database JLPT ${level.toUpperCase()}...`);
      const data = await download(`${BASE_URL}${level}.json`);
      
      // Transformasi: { w: word, r: reading, m: meaning, l: level }
      const transformed = data.map(item => ({
        w: item.word,
        r: item.kana,
        m: item.meaning,
        l: level.toUpperCase()
      }));
      
      combined = combined.concat(transformed);
      console.log(`✅ Berhasil memuat ${data.length} kata dari ${level.toUpperCase()}.`);
    }

    // Pastikan folder assets ada
    const assetsDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(combined));
    console.log('\n---');
    console.log(`🚀 SUKSES! Total ${combined.length} kosakata telah digabung.`);
    console.log(`📦 Tersimpan di: ${OUTPUT_PATH}`);
    console.log(`📊 Ukuran file: ${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(2)} KB`);

  } catch (err) {
    console.error('❌ Gagal sinkronisasi:', err.message);
  }
}

sync();
