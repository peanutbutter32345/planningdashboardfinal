import { BlockList, isIP } from 'node:net';

// Published Cloudflare ranges, checked October 6, 2026:
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
const cloudflare = new BlockList();
for (const range of [
  '173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22',
  '141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20',
  '197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13',
  '104.24.0.0/14','172.64.0.0/13','131.0.72.0/22',
  '2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32',
  '2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32',
]) {
  const [address, prefix] = range.split('/');
  cloudflare.addSubnet(address, Number(prefix), isIP(address) === 6 ? 'ipv6' : 'ipv4');
}
function normalizedIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim().replace(/^::ffff:/i, '');
  return isIP(ip) ? ip : null;
}
export function isCloudflareIp(value) {
  const ip = normalizedIp(value);
  return Boolean(ip && cloudflare.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4'));
}
export function visitorIp(req) {
  // Express trusts one Render hop. Its verified upstream is either the visitor or Cloudflare.
  // A direct-origin caller cannot choose an address just by supplying Cloudflare's headers.
  const upstream = normalizedIp(req.ip || req.socket?.remoteAddress);
  if (isCloudflareIp(upstream)) {
    return normalizedIp(req.headers['cf-connecting-ip']) || upstream;
  }
  return upstream;
}
