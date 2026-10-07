import test from 'node:test';
import assert from 'node:assert/strict';
import {visitorIp,isCloudflareIp} from '../visitor-ip.js';
test('Cloudflare visitors have their own addresses, not a shared proxy bucket',()=>{
 for(const ip of ['104.22.17.198','162.158.167.43','2606:4700::1111']){
  assert.equal(isCloudflareIp(ip),true);
  assert.equal(visitorIp({ip,headers:{'cf-connecting-ip':'203.0.113.42'}}),'203.0.113.42');
 }
 assert.equal(visitorIp({ip:'104.22.17.198',headers:{'cf-connecting-ip':'2001:db8::42'}}),'2001:db8::42');
});
test('a caller outside Cloudflare cannot forge its visitor header',()=>{
 assert.equal(visitorIp({ip:'198.51.100.55',headers:{'cf-connecting-ip':'203.0.113.42'}}),'198.51.100.55');
 assert.equal(visitorIp({ip:'::ffff:198.51.100.55',headers:{}}),'198.51.100.55');
});
test('invalid or multiple addresses in the visitor header are ignored',()=>{
 for(const bad of ['fake','203.0.113.1, 203.0.113.2',''])assert.equal(visitorIp({ip:'104.22.17.198',headers:{'cf-connecting-ip':bad}}),'104.22.17.198');
});
