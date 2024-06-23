import { Socket, connect } from 'net'
import { config, EndpointSchema, OPT_LOG_DEBUG, OPT_LOG_VERBOSE } from '../config'
import { logEvent } from './Logger'
import { HandshakeIncomingPacket } from './protocol/in/HandshakeIncomingPacket'
import { HandshakeOutgoingPacket } from './protocol/out/HandshakeOutgoingPacket'
import { StatusResponseOutgoingPacket } from './protocol/out/StatusResponseOutgoingPacket'
import { PingResponseOutgoingPacket } from './protocol/out/PingResponseOutgoingPacket'
import { PingRequestIncomingPacket } from './protocol/in/PingRequestIncomingPacket'
import { DisconnectOutgoingPacket } from './protocol/out/DisconnectOutgoingPacket'
import { IncomingPacketParseResult, parseIncomingPacket } from './protocol/in/parser'
import { IncomingPacket } from './protocol/in/IncomingPacket'
import { OutgoingPacket } from './protocol/out/OutgoingPacket'

enum SocketState {
    HANDSHAKE,
    STATUS,
    LOGIN,
    FORWARD,
    CLOSED
}

export class ProxySocket {
    private readonly _client: Socket
    private _backend: Socket | undefined
    
    private _state: SocketState
    private _endpoint: EndpointSchema | undefined
    private _version: number
    private _buffer: Buffer
    private readonly _timeoutTimer: NodeJS.Timeout
    private readonly _unregisterClientCallbacks: () => void
    
    private constructor(socket: Socket) {
        this._client = socket
        this._client.setNoDelay(true)
        const clientDataCallback = this._handleClientData.bind(this)
        this._client.on('data', clientDataCallback)
        this._client.on('error', e => {
            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by client socket)`)
            this.close()
        })
        this._client.on('close', () => {
            this.close()
        })
        this._unregisterClientCallbacks = () => {
            this._client.off('data', clientDataCallback)
        }
        
        this._state = SocketState.HANDSHAKE
        this._version = 0
        this._buffer = Buffer.from([])
        this._timeoutTimer = setTimeout(() => {
            if (this._state === SocketState.HANDSHAKE) {
                if (OPT_LOG_VERBOSE) logEvent(this, 'Handshake timed out')
                this.close()
            }
        }, config.handshakeTimeout * 1000)
    }
    
    private _handleClientData(b: Buffer) {
        if (OPT_LOG_DEBUG) logEvent(this, `received ${b.length} B chunk: ${b.toString('hex')}`)
        
        if (this._state === SocketState.HANDSHAKE || this._state === SocketState.STATUS) {
            if ((this._buffer.length + b.length) > config.handshakeBufferLimit) {
                this.close()
                if (OPT_LOG_VERBOSE) logEvent(this, `client didn't send handshake packet within the first ${config.handshakeBufferLimit} bytes`)
                return
            }
            this._buffer = Buffer.concat([this._buffer, b])
            
            while (this._buffer.length > 0) {
                let parseResult: IncomingPacketParseResult
                try {
                    if (this._state === SocketState.HANDSHAKE) parseResult = parseIncomingPacket(this._buffer, 0)
                    else if (this._state === SocketState.STATUS) parseResult = parseIncomingPacket(this._buffer, 1)
                    else if (this._state === SocketState.LOGIN) parseResult = parseIncomingPacket(this._buffer, 2)
                    else break
                } catch (e) {
                    if ((e as Error).message && OPT_LOG_DEBUG) {
                        if (OPT_LOG_VERBOSE) logEvent(this, `failed to parse packet: ${(e as Error).message}`)
                    }
                    break
                }
                const { packet, end } = parseResult
                this._buffer = this._buffer.subarray(end) // shift buffer
                this._handleClientPacket(packet)
            }
        }
    }
    
    private _handleClientPacket(packet: IncomingPacket) {
        if (this._state === SocketState.HANDSHAKE) {
            if (packet.id === 0x00) {
                const handshakePacket = packet as HandshakeIncomingPacket
                const endpoint = config.endpoints.find(x => x.host === handshakePacket.address) || config.endpoints.find(x => x.name === '_default')
                if (endpoint) {
                    this._endpoint = endpoint
                    this._version = handshakePacket.version
                    clearTimeout(this._timeoutTimer)
                    
                    if (endpoint.backend) {
                        const endpointAddress = endpoint.backend.split(':', 2)
                        this._state = SocketState.FORWARD
                        const forwardPacket = new HandshakeOutgoingPacket(
                            handshakePacket.version,
                            endpoint.rewrite || handshakePacket.address,
                            Number(endpointAddress[1] || '25565'),
                            handshakePacket.nextState
                        )
                        
                        if (OPT_LOG_DEBUG) logEvent(this, `connecting to the backend ${endpoint.backend}`)
                        this._client.pause()
                        this._backend = connect({ host: endpointAddress[0], port: Number(endpointAddress[1] || '25565'), timeout: 5000, noDelay: true })
                        this._backend.on('error', e => {
                            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by backend socket)`)
                            this.close()
                        })
                        this._backend.on('close', () => {
                            this.close()
                        })
                        this._backend.on('connect', () => {
                            if (!this._backend || this._state !== SocketState.FORWARD) return
                            if (OPT_LOG_DEBUG) logEvent(this, `backend connected, waiting buffer: ${this._client.writableLength + this._buffer.length} bytes`)
                            this._unregisterClientCallbacks()
                            this._backend.pipe(this._client)
                            this._client.pipe(this._backend)
                            this._backend.write(forwardPacket.toBuffer())
                            this._backend.write(this._buffer)
                            this._client.resume()
                        })
                        this._backend.on('timeout', () => {
                            if (OPT_LOG_VERBOSE) logEvent(this, 'connection to the backend server timed out')
                            this.close()
                        })
                    } else {
                        if (handshakePacket.nextState === 1) { // status
                            this._state = SocketState.STATUS
                        } else {
                            this._state = SocketState.LOGIN
                        }
                    }
                } else {
                    const hostEscaped = handshakePacket.address.substring(0, 16).replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                    if (OPT_LOG_VERBOSE) logEvent(this, `unknown hostname: ${hostEscaped}`)
                    this.close()
                }
            }
        } else if (this._state === SocketState.STATUS) {
            if (packet.id === 0x00) {
                this._send(new StatusResponseOutgoingPacket({
                    version: {
                        name: this._endpoint?.version || '',
                        protocol: this._version
                    },
                    players: {
                        max: 1,
                        online: 0,
                        sample: []
                    },
                    description: {
                        text: this._endpoint?.motd || ''
                    },
                    favicon: '',
                    enforcesSecureChat: false,
                    previewsChat: false,
                }))
            } else if (packet.id === 0x01) {
                this._send(new PingResponseOutgoingPacket(packet as PingRequestIncomingPacket))
            }
        } else if (this._state === SocketState.LOGIN) {
            this._send(new DisconnectOutgoingPacket(this._endpoint?.message || 'Disconnected'), () => {
                this.close()
            })
        }
    }
    
    private _send(p: OutgoingPacket, cb?: () => void) {
        const b = p.toBuffer()
        if (OPT_LOG_DEBUG) logEvent(this, `sending ${b.length} B chunk: ${b.toString('hex')}`)
        this._client.write(b, cb)
    }
    
    public close() {
        this._state = SocketState.CLOSED
        clearTimeout(this._timeoutTimer)
        this._unregisterClientCallbacks()
        this._client.resetAndDestroy()
        if (this._backend) this._backend.resetAndDestroy()
        if (this._buffer.length) this._buffer = Buffer.from([])
    }
    
    public get client(): Socket {
        return this._client
    }
    
    
    public get backend(): Socket | undefined {
        return this._backend
    }
    
    public get state(): SocketState {
        return this._state
    }
    
    public get endpoint(): EndpointSchema | undefined {
        return this._endpoint
    }
    
    public static from(s: Socket) {
        return new ProxySocket(s)
    }
}
