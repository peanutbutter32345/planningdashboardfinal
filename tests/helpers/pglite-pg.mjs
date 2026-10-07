import {PGlite} from '@electric-sql/pglite';
// Use PostgreSQL itself for recovery tests, including FILTER, unique constraints and rollback.
// One embedded connection is serialized to model an exclusive checked-out pool client.
const db=new PGlite();
let tail=Promise.resolve(),failSession=false;
async function acquire(){let unlock;const previous=tail;tail=new Promise(resolve=>unlock=resolve);await previous;return unlock;}
async function query(sql,values){
 if(failSession && /^INSERT INTO sessions/.test(sql)){failSession=false;throw Error('Injected session write failure');}
 const result=values?.length?await db.query(sql,values):(await db.exec(sql)).at(-1);
 return {...result,rowCount:result.affectedRows??result.rows.length};
}
export function failNextSessionInsert(){failSession=true;}
export class Pool{
 async query(sql,values){const release=await acquire();try{return await query(sql,values);}finally{release();}}
 async connect(){const unlock=await acquire();let released=false;return {query,release(){if(!released){released=true;unlock();}}};}
 async end(){}
}
export async function closeDatabase(){await tail;await db.close();}
export default {Pool};
