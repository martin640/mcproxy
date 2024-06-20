import { Socket } from 'net'
import { connect } from 'net'
import EventEmitter from 'events'
import { HandshakeProtocolPacket, ProtocolPacket } from './ProtocolPacket'
import { OPT_ACCEPT_HOST, OPT_BACKEND_PORT, OPT_LOG_VERBOSE } from '../config'

enum SocketState {
    HANDSHAKE,
    FORWARD,
    CLOSED
}

export class ProxySocket extends EventEmitter {
    private readonly _client: Socket
    private readonly _backend: Socket
    private readonly _timeoutTimer: NodeJS.Timeout
    private _state: SocketState
    private _handshakeBuffer: Buffer
    private readonly _pipe: () => void
    
    private constructor(socket: Socket) {
        super()
        
        this._backend = connect({ host: '127.0.0.1', port: OPT_BACKEND_PORT })
        const backendDataCallback = (b: Buffer) => this._handleServerData(b)
        this._backend.on('data', backendDataCallback)
        this._backend.on('error', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            this._client.resetAndDestroy()
        })
        this._backend.on('close', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            this._client.resetAndDestroy()
        })
        
        this._client = socket
        const clientDataCallback = (b: Buffer) => this._handleClientData(b)
        this._client.on('data', clientDataCallback)
        this._client.on('error', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            this._backend.resetAndDestroy()
        })
        this._client.on('close', () => {
            this._state = SocketState.CLOSED
            clearTimeout(this._timeoutTimer)
            this._backend.resetAndDestroy()
        })
        
        this._state = SocketState.HANDSHAKE
        this._handshakeBuffer = Buffer.from([])
        this._timeoutTimer = setTimeout(() => {
            if (this._state === SocketState.HANDSHAKE) {
                if (OPT_LOG_VERBOSE) console.warn(`[${this._tag()}] Handshake timed out`)
                this.close()
            }
        }, 5000)
        this._pipe = () => {
            // create pipes and unregister data handlers
            this._client.pipe(this._backend)
            this._backend.pipe(this._client)
            this._client.off('data', clientDataCallback)
            this._backend.off('data', backendDataCallback)
        }
    }
    
    private _tag() {
        return `${this._client.remoteAddress}:${this._client.remotePort}`
    }
    
    private _handleClientData(b: Buffer) {
        if (this._state === SocketState.HANDSHAKE) {
            if ((this._handshakeBuffer.length + b.length) > 2048) {
                this.close()
                if (OPT_LOG_VERBOSE) console.warn(`[${this._tag()}] client didn't send handshake packet within the first 2 kB`)
            }
            this._handshakeBuffer = Buffer.concat([this._handshakeBuffer, b])
            
            const packet = ProtocolPacket.fromBuffer(this._handshakeBuffer)
            if (packet && (packet.packetID === 0x00)) {
                const handshakePacket = packet as HandshakeProtocolPacket
                if (OPT_ACCEPT_HOST.includes(handshakePacket.address)) {
                    this._state = SocketState.FORWARD
                    clearTimeout(this._timeoutTimer)
                    this._backend.write(this._handshakeBuffer)
                    // release buffer reference
                    this._handshakeBuffer = Buffer.from([])
                    this._pipe()
                } else {
                    const hostEscaped = handshakePacket.address.substring(0, 16).replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                    if (OPT_LOG_VERBOSE) console.warn(`[${this._tag()}] client used incorrect hostname: ${hostEscaped}`)
                    this.close()
                }
            }
        }
    }
    
    private _handleServerData(b: Buffer) {
        // unused
    }
    
    public close() {
        this._state = SocketState.CLOSED
        clearTimeout(this._timeoutTimer)
        this._client.resetAndDestroy()
        this._backend.resetAndDestroy()
        this._handshakeBuffer = Buffer.from([])
    }
    
    public static from(s: Socket) {
        return new ProxySocket(s)
    }
}
