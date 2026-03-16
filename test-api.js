const fs = require('fs');
const fetch = require('node-fetch');

async function test() {
  try {
    const fileBuffer = fs.readFileSync('package.json');
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, 'package.json');

    const res = await fetch('http://localhost:3000/api/extract-pdf', {
      method: 'POST',
      body: formData
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();
