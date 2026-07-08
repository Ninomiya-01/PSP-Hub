const selfsigned = require('selfsigned');
const fs = require('fs');

async function main() {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });

  console.log('Keys returned:', Object.keys(pems));
  
  if (pems.private && pems.cert) {
    fs.writeFileSync('key.pem', pems.private);
    fs.writeFileSync('cert.pem', pems.cert);
    console.log('Certificado gerado com sucesso!');
  } else {
    console.log('Propriedades disponíveis:', JSON.stringify(pems, null, 2));
  }
}

main().catch(console.error);
