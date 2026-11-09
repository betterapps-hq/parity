import { crc32, deflateRawSync } from "node:zlib"

/**
 * A zip of text files, each deflated, as `parity diagnostics` writes (PAR-635). Only what that needs: no folders, no
 * file over 4 GB, and every file dated `modified`.
 */
export function zipFiles(files: readonly { name: string; text: string }[], modified = new Date()): Buffer {
  const { time, date } = dosTime(modified)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const data = Buffer.from(file.text, "utf8")
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflated
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, packed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // made by
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + packed.length
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, end])
}

/** A time and date as zip stores them: two 16-bit fields. */
interface DosTime {
  time: number
  date: number
}

/** A time as zip has it: local time, to two seconds, from 1980. */
function dosTime(at: Date): DosTime {
  const year = Math.max(at.getFullYear(), 1980)

  return {
    // oxlint-disable-next-line no-bitwise -- zip packs hours, minutes and seconds into bit fields of one 16-bit word
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    // oxlint-disable-next-line no-bitwise -- zip packs year, month and day into bit fields of one 16-bit word
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()
  }
}
