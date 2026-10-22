import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAFON_NOTIFY,
  CHAFON_SERVICE,
  CHAFON_WRITE,
  CMD_INVENTORY,
  ChafonFrameParser,
  STATUS_INVENTORY_DONE,
  parseKey,
  parseTag,
  startInventoryCommand,
  stopInventoryCommand,
  type TagRead,
} from './chafon'

export type ReaderStatus = 'unsupported' | 'idle' | 'connecting' | 'connected'

interface Connection {
  device: BluetoothDevice
  write: BluetoothRemoteGATTCharacteristic
  notify: BluetoothRemoteGATTCharacteristic
  onValue: (event: Event) => void
  onDisconnect: () => void
}

// Web Bluetooth needs Chrome (Android or desktop) and HTTPS (or localhost).
export const bluetoothSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.bluetooth && window.isSecureContext

// Direct connection to a Chafon handheld in "transparent" Bluetooth mode.
// Tags arrive while the trigger is held or after `start()`; read-only: the
// app never writes, locks or kills tags.
export function useChafonReader(onTag: (tag: TagRead) => void) {
  const [status, setStatus] = useState<ReaderStatus>(() => (bluetoothSupported() ? 'idle' : 'unsupported'))
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [trigger, setTrigger] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connection = useRef<Connection | null>(null)
  const onTagRef = useRef(onTag)

  useEffect(() => {
    onTagRef.current = onTag
  }, [onTag])

  const release = useCallback(() => {
    const current = connection.current
    connection.current = null
    if (!current) return
    current.notify.removeEventListener('characteristicvaluechanged', current.onValue)
    current.device.removeEventListener('gattserverdisconnected', current.onDisconnect)
    if (current.device.gatt?.connected) current.device.gatt.disconnect()
  }, [])

  const send = useCallback(async (bytes: Uint8Array<ArrayBuffer>) => {
    const write = connection.current?.write
    if (!write) throw new Error('Lector desconectado')
    if (write.properties.writeWithoutResponse && write.writeValueWithoutResponse) {
      await write.writeValueWithoutResponse(bytes)
    } else {
      await write.writeValue(bytes)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!navigator.bluetooth || connection.current) return
    setError(null)
    setStatus('connecting')
    let device: BluetoothDevice | null = null
    try {
      // The reader does not always advertise its service: let the user pick
      // it from the list and request access to the Chafon service.
      device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [CHAFON_SERVICE] })
      const server = await device.gatt!.connect()
      let service: BluetoothRemoteGATTService
      try {
        service = await server.getPrimaryService(CHAFON_SERVICE)
      } catch {
        throw new Error(
          'Ese dispositivo no es un lector Chafon o está en modo HID (teclado). En la app «UHF Reader» del fabricante cambia la salida a «transparente» o usa el modo teclado de esta pantalla.',
        )
      }
      const write = await service.getCharacteristic(CHAFON_WRITE)
      const notify = await service.getCharacteristic(CHAFON_NOTIFY)
      const parser = new ChafonFrameParser()

      const onValue = (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value
        if (!value) return
        for (const frame of parser.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))) {
          const tag = parseTag(frame)
          if (tag) {
            onTagRef.current(tag)
            continue
          }
          if (frame.cmd === CMD_INVENTORY && frame.status === STATUS_INVENTORY_DONE) setReading(false)
          const key = parseKey(frame)
          if (key !== null) setTrigger(key)
        }
      }
      const onDisconnect = () => {
        // Only unexpected disconnections land here (release() unsubscribes).
        connection.current = null
        setStatus('idle')
        setReading(false)
        setTrigger(false)
        setError('Se perdió la conexión con el lector. Vuelve a conectarlo; las lecturas de la lista se conservan.')
      }

      notify.addEventListener('characteristicvaluechanged', onValue)
      device.addEventListener('gattserverdisconnected', onDisconnect)
      connection.current = { device, write, notify, onValue, onDisconnect }
      await notify.startNotifications()
      setDeviceName(device.name || 'Lector Chafon')
      setStatus('connected')
    } catch (err) {
      release()
      if (device?.gatt?.connected) device.gatt.disconnect()
      setStatus('idle')
      // Closing the device chooser is not an error.
      if (err instanceof DOMException && err.name === 'NotFoundError') return
      setError(
        err instanceof Error && !(err instanceof DOMException)
          ? err.message
          : 'No se pudo conectar con el lector. Verifica que esté encendido, cerca y sin otra app conectada.',
      )
    }
  }, [release])

  const start = useCallback(async () => {
    setError(null)
    try {
      await send(startInventoryCommand())
      setReading(true)
    } catch {
      setError('No se pudo iniciar la lectura. Revisa la conexión con el lector.')
    }
  }, [send])

  const stop = useCallback(async () => {
    try {
      await send(stopInventoryCommand())
    } catch {
      // Disconnected: nothing is being read anyway.
    }
    setReading(false)
  }, [send])

  const disconnect = useCallback(async () => {
    if (reading) await stop()
    release()
    setStatus(bluetoothSupported() ? 'idle' : 'unsupported')
    setTrigger(false)
  }, [reading, release, stop])

  // Leaving the screen stops the reader and frees the Bluetooth link.
  useEffect(
    () => () => {
      const current = connection.current
      if (current?.write) {
        void current.write.writeValue(stopInventoryCommand()).catch(() => undefined)
      }
      release()
    },
    [release],
  )

  return { status, deviceName, reading, trigger, error, connect, disconnect, start, stop }
}
