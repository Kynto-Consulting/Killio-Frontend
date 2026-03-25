const { execSync } = require('child_process');
const env = `NEXT_PUBLIC_API_BASE_URL=https://killio-back.vercel.app
NEXT_PUBLIC_API_URL=https://killio-back.vercel.app
NEXT_PUBLIC_ABLY_AUTH_URL=/api/ably-auth
ABLY_API_KEY=7N4yjg.6i_OBw:W1s0NyFHtmCEjIB1RxmMwYWtJL7rWlE-V7BPp1DHOhE
COHERE_API_KEY=IqdburzvF8XP7ctIdHS1Yhsvxi4Z23UtbbF1P0b3`;
const lines = env.split('\n');
for (const line of lines) {
  if(!line.trim()) continue;
  const [k, ...vArr] = line.split('=');
  const v = vArr.join('=');
  console.log('Adding', k);
  try { execSync(`vercel env rm ${k} production --yes`, {stdio:'ignore'}); } catch(e){}
  const b64 = Buffer.from(v).toString('base64');
  const cmd = `node -e "process.stdout.write(Buffer.from('${b64}', 'base64').toString('utf8'))" | vercel env add ${k} production`;
  execSync(cmd, {stdio:'inherit', shell:true});
}
