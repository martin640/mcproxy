const SEGMENT_BITS = 0x7F
const CONTINUE_BIT = 0x80

export class VariableWriteableBuffer {
    private readonly _data: number[]
    
    constructor() {
        this._data = []
    }
    
    public writeVarInt(value: number): number {
        let bytes = 0
        while (true) {
            if ((value & ~SEGMENT_BITS) == 0) {
                this._data.push(value)
                bytes++
                return bytes
            }
            this._data.push((value & SEGMENT_BITS) | CONTINUE_BIT)
            bytes++
            value >>>= 7
        }
    }
    
    public writeUShort(value: number) {
        this._data.push(value >>> 8)
        this._data.push(value)
    }
    
    public writeString(value: string): number {
        let bytes = 0
        const b = Buffer.from(value, 'utf-8')
        bytes += this.writeVarInt(b.length)
        if (b.length) {
            this._data.push(...b)
            bytes += b.length
        }
        return bytes
    }
    
    public writeBuffer(value: Buffer): number {
        this._data.push(...value)
        return value.length
    }
    
    public write(value: VariableWriteableBuffer | number[]): number {
        if (Array.isArray(value)) {
            this._data.push(...value)
            return value.length
        } else {
            this._data.push(...value._data)
            return value._data.length
        }
    }
    
    public get length() {
        return this._data.length
    }
    
    public toBuffer() {
        return Buffer.from(this._data)
    }
}

export class OutgoingPacket {
    private readonly _id: number
    protected readonly _raw: VariableWriteableBuffer
    
    constructor(id: number) {
        this._id = id
        this._raw = new VariableWriteableBuffer()
    }
    
    public get id(): number {
        return this._id
    }
    
    public toBuffer() {
        const tmp = new VariableWriteableBuffer()
        const idLen = tmp.writeVarInt(this._id)
        const bytes = new VariableWriteableBuffer()
        bytes.writeVarInt(idLen + this._raw.length)
        bytes.writeVarInt(this._id)
        bytes.write(this._raw)
        return bytes.toBuffer()
    }
}