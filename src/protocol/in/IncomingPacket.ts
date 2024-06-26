const SEGMENT_BITS = 0x7F
const CONTINUE_BIT = 0x80

export class CursoredBuffer {
    private readonly _buffer: Buffer
    private _cursor: number
    
    constructor(buffer: Buffer) {
        this._buffer = buffer
        this._cursor = 0
    }
    
    public reset() {
        this._cursor = 0
    }
    
    public seek(pos: number) {
        this._cursor = pos
    }
    
    public get buffer(): Buffer {
        return this._buffer
    }
    
    public get position() {
        return this._cursor
    }
    
    public get length() {
        return this._buffer.length
    }
    
    public readByte() {
        if (this._cursor >= this._buffer.length) return 0x00
        return this._buffer[this._cursor++]
    }
    
    public readVarInt(): number {
        let value = 0
        let position = 0
        let currentByte = 0
        
        while (true) {
            currentByte = this.readByte()
            value |= (currentByte & SEGMENT_BITS) << position
            if ((currentByte & CONTINUE_BIT) == 0) break
            position += 7
            if (position >= 32) throw new Error('VarInt is too big')
        }
        
        return value
    }
    
    public readVarLong(): number {
        let value = 0
        let position = 0
        let currentByte = 0
        
        while (true) {
            currentByte = this.readByte()
            value |= (currentByte & SEGMENT_BITS) << position
            if ((currentByte & CONTINUE_BIT) == 0) break
            position += 7
            if (position >= 64) throw new Error('VarLong is too big')
        }
        
        return value
    }
    
    public readUShort(): number {
        this._cursor += 2
        return this._buffer.readUintBE(this._cursor - 2, 2)
    }
    
    public readLong(): bigint {
        this._cursor += 8
        return this._buffer.readBigInt64BE(this._cursor - 8)
    }
    
    public readString(): string {
        const length = this.readVarInt()
        if (length) {
            const str = this._buffer.subarray(this._cursor, this._cursor + length)
            this._cursor += length
            return str.toString('utf-8')
        } else {
            return ''
        }
    }
}

export class IncomingPacket {
    protected readonly _raw: CursoredBuffer
    private readonly _length: number
    private readonly _id: number
    
    constructor(length: number, id: number, raw: Buffer) {
        this._length = length
        this._id = id
        this._raw = new CursoredBuffer(raw)
    }
    
    public get length(): number {
        return this._length
    }
    
    public get id(): number {
        return this._id
    }
    
    public get raw(): Buffer {
        return this._raw.buffer
    }
}
