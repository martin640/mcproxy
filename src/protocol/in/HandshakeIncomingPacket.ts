import { IncomingPacket } from './IncomingPacket'

export class HandshakeIncomingPacket extends IncomingPacket {
    private readonly _version: number
    private readonly _address: string
    private readonly _port: number
    private readonly _nextState: number
    
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
        this._version = this._raw.readVarInt()
        this._address = this._raw.readString()
        this._port = this._raw.readUShort()
        this._nextState = this._raw.readVarInt()
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
