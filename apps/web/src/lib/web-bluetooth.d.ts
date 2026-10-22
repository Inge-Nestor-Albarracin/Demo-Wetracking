// Minimal Web Bluetooth types (Chrome on Android/desktop; not in lib.dom).
// Only what the Chafon reader connection uses.

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value?: DataView
  readonly properties: { writeWithoutResponse: boolean; write: boolean; notify: boolean }
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  writeValue(value: BufferSource): Promise<void>
  writeValueWithoutResponse?(value: BufferSource): Promise<void>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>
}

interface BluetoothDevice extends EventTarget {
  readonly id: string
  readonly name?: string
  readonly gatt?: BluetoothRemoteGATTServer
}

interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean
  filters?: { services?: string[]; namePrefix?: string }[]
  optionalServices?: string[]
}

interface Bluetooth {
  getAvailability(): Promise<boolean>
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>
}

interface Navigator {
  readonly bluetooth?: Bluetooth
}
