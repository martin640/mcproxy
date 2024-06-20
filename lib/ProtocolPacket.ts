const SEGMENT_BITS = 0x7F
const CONTINUE_BIT = 0x80

export interface ProtocolPacket {
    raw: Buffer
}

export class ProtocolPacket {
    private readonly _length: number
    private readonly _id: number
    protected _data: Buffer
    protected _cursor: number = 0
    
    constructor(length: number, id: number, data: Buffer) {
        this._length = length
        this._id = id
        this._data = data
    }
    
    public get length() { return this._length }
    public get packetID() { return this._id }
    
    protected resetCursor() { this._cursor = 0 }
    protected readByte(): number {
        if (this._cursor >= this._data.length) return 0x00
        return this._data[this._cursor++]
    }
    protected readVarInt(): number {
        let value = 0
        let position = 0
        let currentByte = 0
        
        while (true) {
            currentByte = this.readByte()
            value |= (currentByte & SEGMENT_BITS) << position
            if ((currentByte & CONTINUE_BIT) == 0) break
            position += 7
            if (position >= 32) throw new Error("VarInt is too big")
        }
        
        return value
    }
    protected readVarLong(): number {
        let value = 0
        let position = 0
        let currentByte = 0
        
        while (true) {
            currentByte = this.readByte()
            value |= (currentByte & SEGMENT_BITS) << position
            if ((currentByte & CONTINUE_BIT) == 0) break
            position += 7
            if (position >= 64) throw new Error("VarLong is too big")
        }
        
        return value
    }
    protected readUShort(): number { return this._data.readUintBE(this._cursor++, 2) }
    protected readString(): string {
        const length = this.readVarInt()
        if (length) {
            const str = this._data.subarray(this._cursor, this._cursor + length)
            this._cursor += length
            return str.toString('utf-8')
        } else {
            return ''
        }
    }
    
    public static fromBuffer(b: Buffer): ProtocolPacket | null {
        let position = 0
        const readByte = () => b[position++]
        const readVarInt = () => {
            let value = 0
            let position = 0
            let currentByte = 0
            
            while (true) {
                currentByte = readByte();
                value |= (currentByte & SEGMENT_BITS) << position;
                if ((currentByte & CONTINUE_BIT) == 0) break;
                position += 7;
                if (position >= 32) throw new Error("VarInt is too big");
            }
            
            return value;
        }
        
        try {
            const length = readVarInt()
            const id = readVarInt()
            const content = b.subarray(position)
            
            switch (id) {
                case 0x00: return new HandshakeProtocolPacket(length, id, content)
                default: return new ProtocolPacket(length, id, content)
            }
        } catch (e) {
            return null
        }
    }
}

export class HandshakeProtocolPacket extends ProtocolPacket {
    private readonly _version: number
    private readonly _address: string
    private readonly _port: number
    private readonly _nextState: number
    
    constructor(length: number, id: number, data: Buffer) {
        super(length, id, data)
        this.resetCursor()
        this._version = this.readVarInt()
        this._address = this.readString()
        this._port = this.readUShort()
        this._nextState = this.readVarInt()
    }
    
    public get version(): number {
        return this._version
    }
    
    public get address(): string {
        return this._address
    }
    
    public get port(): number {
        return this._port
    }
    
    public get nextState(): number {
        return this._nextState
    }
}
