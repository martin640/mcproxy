import { OutgoingPacket } from './OutgoingPacket'

export class HandshakeOutgoingPacket extends OutgoingPacket {
    private readonly _version: number
    private readonly _address: string
    private readonly _port: number
    private readonly _nextState: number
    
    constructor(version: number, address: string, port: number, nextState: number) {
        super(0x00)
        this._version = version
        this._address = address
        this._port = port
        this._nextState = nextState
        this._raw.writeVarInt(version)
        this._raw.writeString(address)
        this._raw.writeUShort(port)
        this._raw.writeVarInt(nextState)
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
