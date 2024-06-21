import { HandshakeIncomingPacket } from './HandshakeIncomingPacket'
import { StatusRequestIncomingPacket } from './StatusRequestIncomingPacket'
import { PingRequestIncomingPacket } from './PingRequestIncomingPacket'
import { CursoredBuffer, IncomingPacket } from './IncomingPacket'
import { LoginStartIncomingPacket } from './LoginStartIncomingPacket'

export interface IncomingPacketParseResult {
    packet: IncomingPacket
    end: number
}

export const parseIncomingPacket = (b: Buffer, state: number): IncomingPacketParseResult => {
    const reader = new CursoredBuffer(b)
    const length = reader.readVarInt() 
    let position = reader.position
    const id = reader.readVarInt()
    if (b.length < reader.position + length - position) throw new Error(`Expected buffer of size >= ${reader.position + length - position}, got ${b.length}`)
    const raw = b.subarray(reader.position, reader.position + length - position)
    let packet: IncomingPacket | null = null
    
    if (state === 0) {
        if (id === 0x00) packet = new HandshakeIncomingPacket(length, id, raw)
    }
    if (state === 1) {
        if (id === 0x00) packet = new StatusRequestIncomingPacket(length, id, raw)
        if (id === 0x01) packet = new PingRequestIncomingPacket(length, id, raw)
    }
    if (state === 2) {
        if (id === 0x00) packet = new LoginStartIncomingPacket(length, id, raw)
    }
    
    if (!packet) packet = new IncomingPacket(length, id, raw)
    
    return { packet, end: reader.position + length - position }
}
