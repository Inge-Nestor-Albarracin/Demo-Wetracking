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

// --- Read range (RF output power) -------------------------------------
// The vendor app (SDK SettingFragment) changes the power by reading all the
// parameters (RFM_GET_ALL_PARAM), replacing RfidPower and writing them back
// unchanged (RFM_SET_ALL_PARAM). Same here, so no other setting is touched.
// Codes and offsets taken from the SDK library (CmdBuilder / CmdHandler);
// the manual lists device info as 0x0051 but the SDK sends 0x0070.
export const CMD_DEVICE_INFO = 0x0070
export const CMD_SET_ALL_PARAMS = 0x0071
export const CMD_GET_ALL_PARAMS = 0x0072

// Parameters after STATUS: Addr RFIDPRO WorkMode Interface Baudrate WGSet Ant
// RfidFreq(8) RfidPower InquiryArea QValue Session AcsAddr AcsDataLen
// FilterTime TriggerTime BuzzerTime PollingInterval = 25 bytes.
const PARAMS_LENGTH = 25
const POWER_INDEX = 15
// Highest power among the supported handhelds (H103), in dBm.
const POWER_LIMIT = 33

export interface ReaderParams {
  raw: Uint8Array // the 25 parameter bytes as reported by the reader
  power: number // dBm
}

export const deviceInfoCommand = () => buildCommand(CMD_DEVICE_INFO)
export const getParamsCommand = () => buildCommand(CMD_GET_ALL_PARAMS)

export function parseParams(frame: ChafonFrame): ReaderParams | null {
  if (frame.cmd !== CMD_GET_ALL_PARAMS || frame.status !== STATUS_OK) return null
  if (frame.data.length < PARAMS_LENGTH) return null
  const raw = frame.data.slice(0, PARAMS_LENGTH)
  const power = raw[POWER_INDEX]
  // Out of range means the frame is not what we expect: never write it back.
  if (power > POWER_LIMIT) return null
  return { raw, power }
}

export function setPowerCommand(params: ReaderParams, power: number): Uint8Array<ArrayBuffer> {
  const raw = Array.from(params.raw)
  raw[POWER_INDEX] = Math.min(POWER_LIMIT, Math.max(1, Math.round(power)))
  return buildCommand(CMD_SET_ALL_PARAMS, raw)
}

// Device info after STATUS: hardware version (32 bytes ASCII), firmware
// version (32) and serial number (12). The model (H100…) is in the versions.
export function parseModel(frame: ChafonFrame): string | null {
  if (frame.cmd !== CMD_DEVICE_INFO || frame.status !== STATUS_OK) return null
  const text = String.fromCharCode(...frame.data.slice(0, 64))
  return /H10[0-4]/i.exec(text)?.[0].toUpperCase() ?? null
}

// Power range per model (manual, RFM_SET_PWR). Unknown model: the general
// range of RFM_SET_ALL_PARAM, the reader rejects what it cannot do.
export function powerRange(model: string | null): { min: number; max: number } {
  if (model === 'H100') return { min: 5, max: 20 }
  if (model === 'H102') return { min: 5, max: 26 }
  if (model === 'H103' || model === 'H104') return { min: 5, max: 33 }
  return { min: 5, max: 30 }
}

// RFM_REPORT_KEYSTA: trigger pressed (true) or released (false).
export function parseKey(frame: ChafonFrame): boolean | null {
  if (frame.cmd !== CMD_REPORT_KEY) return null
  // Reported without STATUS: the key state is the first data byte.
  if (frame.status === 0x01) return true
  if (frame.status === 0x02) return false
  return null
}
