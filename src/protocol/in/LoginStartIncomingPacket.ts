import { IncomingPacket } from './IncomingPacket'

export class LoginStartIncomingPacket extends IncomingPacket {
    private readonly _username: string
    private readonly _uuid: number
    
    constructor(length: number, id: number, raw: Buffer) {
        super(length, id, raw)
        this._username = this._raw.readString()
        this._uuid = 0
    }
    
    public get username(): string {
        return this._username
    }
    
    public get uuid(): number {
        return this._uuid
    }
}
