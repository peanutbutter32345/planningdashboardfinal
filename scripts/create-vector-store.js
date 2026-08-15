import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY in .env first.');

const knowledgeDir = path.resolve('knowledge');
const files = fs.readdirSync(knowledgeDir).filter(name => !name.startsWith('.') && name !== 'README.md');
if (!files.length) {
  console.log('No knowledge files found. Put PDFs, DOCX, TXT, MD, or other supported documents in ./knowledge and run again.');
  process.exit(0);
}

async function request(url, options={}) {
  const res = await fetch(url, { ...options, headers:{Authorization:`Bearer ${apiKey}`,...(options.headers||{})} });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const vectorStore = await request('https://api.openai.com/v1/vector_stores', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'South Bay Planning Knowledge Base'})
});
console.log('Created vector store:', vectorStore.id);

const uploadedIds = [];
for (const name of files) {
  const form = new FormData();
  form.append('purpose','assistants');
  const bytes = fs.readFileSync(path.join(knowledgeDir,name));
  form.append('file', new Blob([bytes]), name);
  const uploaded = await request('https://api.openai.com/v1/files', {method:'POST', body:form});
  uploadedIds.push(uploaded.id);
  console.log('Uploaded:', name, uploaded.id);
}

const batch = await request(`https://api.openai.com/v1/vector_stores/${vectorStore.id}/file_batches`, {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({file_ids:uploadedIds})
});
console.log('Attached files. Batch:', batch.id);
console.log('\nAdd this to .env:\nOPENAI_VECTOR_STORE_ID='+vectorStore.id);
console.log('\nIndexing may take a short time. The server will use File Search automatically once this ID is set.');
