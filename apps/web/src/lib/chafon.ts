// Chafon UHF handheld readers (H100 / H102 / H103), "transparent" Bluetooth
// mode. Protocol from the vendor SDK: «UHF Hand Reader User Manual V1.2» and
// «Bluetooth Development 20250304»; UUIDs confirmed in the SDK demo app.
//
// Frame:    HEAD(0xCF) ADDR CMD(2, MSB first) LEN DATA[LEN] CRC16(2, MSB first)
// Response: same, DATA starts with STATUS. CRC16 covers HEAD..DATA
//           (preset 0xFFFF, reflected polynomial 0x8408).

export const CHAFON_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb'
export const CHAFON_WRITE = '0000ffe3-0000-1000-8000-00805f9b34fb'
export const CHAFON_NOTIFY = '0000ffe4-0000-1000-8000-00805f9b34fb'

const HEAD = 0xcf
const BROADCAST = 0xff

export const CMD_INVENTORY = 0x0001
export const CMD_STOP_INVENTORY = 0x0002
export const CMD_REPORT_KEY = 0x0089

// Inventory responses: 0x00 = one tag read, 0x12 = inventory finished.
export const STATUS_OK = 0x00
export const STATUS_INVENTORY_DONE = 0x12

export function crc16(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0xffff
  for (let i = 0; i < length; i += 1) {
    crc ^= bytes[i]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1
    }
  }
  return crc
}

export function buildCommand(cmd: number, data: number[] = []): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(7 + data.length)
  frame.set([HEAD, BROADCAST, cmd >> 8, cmd & 0xff, data.length, ...data])
  const crc = crc16(frame, 5 + data.length)
  frame[5 + data.length] = crc >> 8
  frame[6 + data.length] = crc & 0xff
  return frame
}

// RFM_INVENTORYISO_CONTINUE by time with 0 seconds: reads until stopped.
export const startInventoryCommand = () => buildCommand(CMD_INVENTORY, [0x00, 0, 0, 0, 0])
export const stopInventoryCommand = () => buildCommand(CMD_STOP_INVENTORY)

export interface ChafonFrame {
  cmd: number
  status: number
  data: Uint8Array // after STATUS
}

// BLE notifications are small (often 20 bytes), so a frame may arrive split
// across several notifications or several frames in one. The parser
// re-assembles them and drops bytes until a frame with a valid CRC.
export class ChafonFrameParser {
  private buffer: number[] = []

  push(chunk: Uint8Array): ChafonFrame[] {
    for (const byte of chunk) this.buffer.push(byte)
    const frames: ChafonFrame[] = []
    for (;;) {
      const start = this.buffer.indexOf(HEAD)
      if (start < 0) {
        this.buffer = []
        break
      }
      if (start > 0) this.buffer.splice(0, start)
      if (this.buffer.length < 5) break
      const length = this.buffer[4]
      const total = 7 + length
      if (this.buffer.length < total) break
      const frame = Uint8Array.from(this.buffer.slice(0, total))
      const expected = (frame[total - 2] << 8) | frame[total - 1]
      if (length < 1 || crc16(frame, total - 2) !== expected) {
        // Not a real frame start: skip this 0xCF and look for the next one.
        this.buffer.splice(0, 1)
        continue
      }
      this.buffer.splice(0, total)
      frames.push({
        cmd: (frame[2] << 8) | frame[3],
        status: frame[5],
        data: frame.slice(6, total - 2),
      })
    }
    // A corrupted stream must not grow without bound.
    if (this.buffer.length > 1024) this.buffer = []
    return frames
  }
}

export interface TagRead {
  epc: string // upper-case hex, leading zeros kept
  rssi: number // dBm
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()

// Tag data after STATUS: RSSI(2, signed) ANT(1) CHANNEL(1) EPC_LEN(1) EPC.
// Barcodes (H103/H104 scan head) use the same command with RSSI 0, antenna 0
// and data wrapped in 0x02 … 0x03 0x0D; they are not chips and are ignored.
export function parseTag(frame: ChafonFrame): TagRead | null {
  if (frame.cmd !== CMD_INVENTORY || frame.status !== STATUS_OK) return null
  const d = frame.data
  if (d.length < 5) return null
  const epcLength = d[4]
  if (epcLength === 0 || d.length < 5 + epcLength) return null
  const epc = d.slice(5, 5 + epcLength)
  const raw = (d[0] << 8) | d[1]
  const rssi = raw & 0x8000 ? raw - 0x10000 : raw
  const barcode = raw === 0 && d[2] === 0 && epc[0] === 0x02 && epc[epc.length - 2] === 0x03 && epc[epc.length - 1] === 0x0d
  if (barcode) return null
  return { epc: hex(epc), rssi }
}

// RFM_REPORT_KEYSTA: trigger pressed (true) or released (false).
export function parseKey(frame: ChafonFrame): boolean | null {
  if (frame.cmd !== CMD_REPORT_KEY) return null
  // Reported without STATUS: the key state is the first data byte.
  if (frame.status === 0x01) return true
  if (frame.status === 0x02) return false
  return null
}
