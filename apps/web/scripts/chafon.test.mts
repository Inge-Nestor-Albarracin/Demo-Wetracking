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
// 6. Read range: GET_ALL_PARAM (0x0072) response -> SET_ALL_PARAM (0x0071)
// with only RfidPower changed (offsets from the SDK CmdBuilder/CmdHandler).
assert.equal(hex(c.getParamsCommand()).slice(0, 10), 'cfff007200');
assert.equal(hex(c.deviceInfoCommand()).slice(0, 10), 'cfff007000');
const params = [0x00, 0x00, 0x00, 0x80, 0x04, 0x00, 0x01, 0x01, 0x03, 0x86, 0x02, 0xee, 0x01, 0xf4, 0x32,
  26, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01];
const resp = new c.ChafonFrameParser().push(c.buildCommand(0x0072, [0x00, ...params]))[0];
const parsed = c.parseParams(resp)!;
assert.equal(parsed.power, 26);
const set = c.setPowerCommand(parsed, 12);
assert.equal(hex(set.slice(0, 5)), 'cfff007119');
const expected = [...params]; expected[15] = 12;
assert.deepEqual([...set.slice(5, 30)], expected); // everything else unchanged
assert.equal(c.crc16(set, 30), (set[30] << 8) | set[31]);
assert.equal(c.setPowerCommand(parsed, 99)[20], 33); // clamped
assert.equal(c.parseParams(new c.ChafonFrameParser().push(c.buildCommand(0x0072, [0x00, ...params.slice(0, 10)]))[0]), null);
const badPower = [...params]; badPower[15] = 0xc8;
assert.equal(c.parseParams(new c.ChafonFrameParser().push(c.buildCommand(0x0072, [0x00, ...badPower]))[0]), null);
// 7. Device info: model from the hardware/firmware version text.
const ascii = (s: string, n: number) => [...Buffer.from(s.padEnd(n, '\0'), 'latin1')];
const info = new c.ChafonFrameParser().push(c.buildCommand(0x0070, [0x00, ...ascii('HW-V2.1', 32), ...ascii('H103-FW-1.0.7', 32), ...ascii('SN0001', 12)]))[0];
assert.equal(c.parseModel(info), 'H103');
assert.deepEqual(c.powerRange('H103'), { min: 5, max: 33 });
assert.deepEqual(c.powerRange(null), { min: 5, max: 30 });
console.log('chafon protocol: 7/7 OK');
