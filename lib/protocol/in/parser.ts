import { HandshakeIncomingPacket } from './HandshakeIncomingPacket'
import { StatusRequestIncomingPacket } from './StatusRequestIncomingPacket'
import { PingRequestIncomingPacket } from './PingRequestIncomingPacket'
import { CursoredBuffer, IncomingPacket } from './IncomingPacket'

export const parseIncomingPacket = (b: Buffer, state: number): IncomingPacket => {
    const reader = new CursoredBuffer(b)
    const length = reader.readVarInt() 
    const id = reader.readVarInt()
    const raw = b.subarray(reader.position, reader.position + length)
    
    if (state === 0) {
        if (id === 0x00) return new HandshakeIncomingPacket(length, id, raw)
    }
    if (state === 1) {
        if (id === 0x00) return new StatusRequestIncomingPacket(length, id, raw)
        if (id === 0x01) return new PingRequestIncomingPacket(length, id, raw)
    }
    
    return new IncomingPacket(length, id, raw)
}
