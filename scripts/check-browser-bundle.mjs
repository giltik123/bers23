import { readFile, readdir } from 'node:fs/promises';
const files=(await readdir('dist/assets')).filter(file=>file.endsWith('.js'));
// Match module/secret signatures rather than harmless product words such as "sharpen".
const forbidden=['require("sharp")','from"sharp"',"from'sharp'",'node-postgres','BEGIN PRIVATE KEY','JWT_SECRET','server/core/providers'];
for(const file of files){const text=await readFile(`dist/assets/${file}`,'utf8');for(const token of forbidden)if(text.includes(token))throw new Error(`Browser bundle contains forbidden server token ${token} in ${file}`)}
console.log(`Browser bundle guard passed (${files.length} JavaScript chunks)`);
