// Gates requests to a configured set of CIDR ranges (the college Wi-Fi).
// Supports both IPv4 and IPv6 CIDRs. Reads ALLOWED_CIDRS from env at boot.

function ipToBytes(ip) {
    if (ip.includes('.')) {
        // IPv4 — return 4 bytes
        const parts = ip.split('.').map((p) => parseInt(p, 10));
        if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
            return null;
        }
        return Uint8Array.from(parts);
    }

    // IPv6 — handle :: shorthand, return 16 bytes
    let head = ip;
    let tail = '';
    if (ip.includes('::')) {
        const [h, t] = ip.split('::');
        head = h;
        tail = t;
    }
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const fillCount = 8 - headParts.length - tailParts.length;
    if (fillCount < 0) return null;
    const fill = Array(fillCount).fill('0');
    const all = [...headParts, ...fill, ...tailParts];
    if (all.length !== 8) return null;

    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        const n = parseInt(all[i] || '0', 16);
        if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
        bytes[i * 2] = (n >> 8) & 0xff;
        bytes[i * 2 + 1] = n & 0xff;
    }
    return bytes;
}

function inCidr(ip, cidr) {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    const ipBytes = ipToBytes(ip);
    const rangeBytes = ipToBytes(range);
    if (!ipBytes || !rangeBytes || ipBytes.length !== rangeBytes.length) return false;
    if (Number.isNaN(bits) || bits < 0 || bits > ipBytes.length * 8) return false;

    const fullBytes = Math.floor(bits / 8);
    const tailBits = bits % 8;
    for (let i = 0; i < fullBytes; i++) {
        if (ipBytes[i] !== rangeBytes[i]) return false;
    }
    if (tailBits > 0) {
        const mask = (0xff << (8 - tailBits)) & 0xff;
        if ((ipBytes[fullBytes] & mask) !== (rangeBytes[fullBytes] & mask)) return false;
    }
    return true;
}

function normalizeIp(raw) {
    if (!raw) return '';
    // Strip IPv4-mapped IPv6 prefix: ::ffff:1.2.3.4
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    return raw;
}

const allowed = (process.env.ALLOWED_CIDRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function requireCollegeNetwork(req, res, next) {
    if (allowed.length === 0) {
        return res.status(500).json({ error: 'ALLOWED_CIDRS is not configured' });
    }
    const ip = normalizeIp(req.ip);
    const ok = allowed.some((cidr) => inCidr(ip, cidr));
    if (!ok) {
        return res.status(403).json({
            error: 'You must be connected to the college Wi-Fi to use this',
            ip,
        });
    }
    return next();
}

module.exports = { requireCollegeNetwork, inCidr, ipToBytes };
