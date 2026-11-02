// Incremental UTF-8 for wx.request ArrayBuffer chunks, including split codepoints.
// Incomplete or malformed byte sequences fail rather than silently altering text.
class Utf8Stream {
  constructor() { this.pending = new Uint8Array(0); this.first = true }

  write(input, final = false) {
    if (typeof input === 'string') {
      if (this.pending.length) throw Error('Incomplete UTF-8 before text response')
      return this.start(input)
    }
    let part
    if (input == null) part = new Uint8Array(0)
    else if (ArrayBuffer.isView(input)) part = new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    else part = new Uint8Array(input)
    const bytes = new Uint8Array(this.pending.length + part.length)
    bytes.set(this.pending); bytes.set(part, this.pending.length)
    let end = bytes.length
    if (!final && end) {
      let lead = end - 1
      while (lead >= 0 && (bytes[lead] & 0xc0) === 0x80) lead--
      if (lead >= 0) {
        const b = bytes[lead]
        const size = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 1
        if (size > end - lead) end = lead
      }
    }
    this.pending = bytes.slice(end)
    const hex = '0123456789ABCDEF'
    let escaped = ''
    for (let i = 0; i < end; i++) escaped += '%' + hex[bytes[i] >> 4] + hex[bytes[i] & 15]
    const decoded = escaped ? decodeURIComponent(escaped) : ''
    return this.start(decoded)
  }

  start(text) {
    if (!text || !this.first) return text
    this.first = false
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  }
}

module.exports = { Utf8Stream }
