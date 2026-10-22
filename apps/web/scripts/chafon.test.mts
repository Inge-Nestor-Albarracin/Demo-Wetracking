// Protocol tests for src/lib/chafon.ts (Chafon H100/H102/H103 BLE frames).
// Run: pnpm test (Node 24 runs TypeScript directly). No device needed.
import assert from 'node:assert/strict';
import * as c from '../src/lib/chafon.ts';
const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');
// 1. Documented example command (BLEDemo instructions): cf ff 00 01 05 00 00 00 00 00 f5 b5
assert.equal(hex(c.startInventoryCommand()), 'cfff00010500000000' + '00f5b5');
assert.equal(hex(c.stopInventoryCommand()).slice(0, 10), 'cfff000200');
// 2. Tag frame per manual: CF 00 0001 LEN STATUS RSSI(2) ANT CH EPCLEN EPC CRC
function tagFrame(epcHex: string, rssi = -32) {
  const epc = [...Buffer.from(epcHex, 'hex')];
  const r = rssi & 0xffff;
  const info = [0x00, r >> 8, r & 0xff, 0x01, 0x05, epc.length, ...epc];
  const f = new Uint8Array([0xcf, 0x00, 0x00, 0x01, info.length, ...info, 0, 0]);
  const crc = c.crc16(f, f.length - 2); f[f.length - 2] = crc >> 8; f[f.length - 1] = crc & 0xff;
  return f;
}
const p = new c.ChafonFrameParser();
const a = tagFrame('E28068940000501EC0B8D1A0', -32);
const b = tagFrame('000000000000000000001234', -61);
const stream = new Uint8Array([0x11, 0xcf, 0x22, ...a, ...b]); // noise + fake head
const out: c.TagRead[] = [];
for (let i = 0; i < stream.length; i += 7) for (const fr of p.push(stream.slice(i, i + 7))) { const t = c.parseTag(fr); if (t) out.push(t); }
assert.deepEqual(out, [{ epc: 'E28068940000501EC0B8D1A0', rssi: -32 }, { epc: '000000000000000000001234', rssi: -61 }]);
// 3. Corrupted CRC is dropped, next valid frame still parsed.
const bad = tagFrame('E2000000000000000000AAAA'); bad[bad.length - 1] ^= 0xff;
const p2 = new c.ChafonFrameParser();
const got = [...p2.push(bad), ...p2.push(tagFrame('E2000000000000000000BBBB'))].map(c.parseTag).filter(Boolean);
assert.deepEqual(got.map((t) => t!.epc), ['E2000000000000000000BBBB']);
// 4. "Inventory finished" (0x12) and key report frames.
const done = c.buildCommand(0x0001, [0x12]); const key = c.buildCommand(0x0089, [0x01]);
const p3 = new c.ChafonFrameParser(); const [f1, f2] = p3.push(new Uint8Array([...done, ...key]));
assert.equal(f1.status, c.STATUS_INVENTORY_DONE); assert.equal(c.parseTag(f1), null); assert.equal(c.parseKey(f2), true);
// 5. Barcode frame (RSSI 0, ANT 0, 02 ... 03 0D) is ignored.
const bc = [...Buffer.from('02' + Buffer.from('ABC123').toString('hex') + '030d', 'hex')];
const barcode = c.buildCommand(0x0001, [0x00, 0, 0, 0, 0, bc.length, ...bc]);
assert.equal(c.parseTag(new c.ChafonFrameParser().push(barcode)[0]), null);
console.log('chafon protocol: 5/5 OK');
