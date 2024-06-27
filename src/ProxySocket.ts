import { connect, Socket } from 'net'
import { config, DISCONNECT_MESSAGE_DEFAULT, EndpointSchema, OPT_LOG_DEBUG, OPT_LOG_VERBOSE } from '../config'
import { logEvent } from './logger'
import { HandshakeIncomingPacket } from './protocol/in/HandshakeIncomingPacket'
import { HandshakeOutgoingPacket } from './protocol/out/HandshakeOutgoingPacket'
import { StatusResponseOutgoingPacket } from './protocol/out/StatusResponseOutgoingPacket'
import { PingResponseOutgoingPacket } from './protocol/out/PingResponseOutgoingPacket'
import { PingRequestIncomingPacket } from './protocol/in/PingRequestIncomingPacket'
import { DisconnectOutgoingPacket } from './protocol/out/DisconnectOutgoingPacket'
import { IncomingPacketParseResult, IncomingPacketSource, parseIncomingPacket } from './protocol/in/parser'
import { IncomingPacket } from './protocol/in/IncomingPacket'
import { copyIncomingPacketAsOutgoing, OutgoingPacket } from './protocol/out/OutgoingPacket'
import { StatusResponseIncomingPacket } from './protocol/in/StatusResponseIncomingPacket'

enum SocketState {
    HANDSHAKE,
    CONNECT,
    STATUS,
    LOGIN,
    FORWARD,
    CLOSING,
    CLOSED
}

const SocketStateNames = {
    [SocketState.HANDSHAKE]: 'HANDSHAKE',
    [SocketState.CONNECT]: 'CONNECT',
    [SocketState.STATUS]: 'STATUS',
    [SocketState.LOGIN]: 'LOGIN',
    [SocketState.FORWARD]: 'FORWARD',
    [SocketState.CLOSING]: 'CLOSING',
    [SocketState.CLOSED]: 'CLOSED',
}

export class ProxySocket {
    private readonly _client: Socket
    private _backend: Socket | undefined
    
    private readonly _timeStarted: number
    private _state: SocketState
    private _endpoint: EndpointSchema | undefined
    private _version: number
    private _clientBuffer: Buffer
    private _backendBuffer: Buffer
    private _clientBufferOffset: number
    private _backendBufferOffset: number
    private _clientPackets: number
    private readonly _clientDataCallback: (_: Buffer) => void
    private readonly _backendDataCallback: (_: Buffer) => void
    
    private readonly _clientTimeoutTimer: NodeJS.Timeout
    private readonly _closureTimeoutTimer: NodeJS.Timeout
    
    public constructor(socket: Socket, timeStarted: number = performance.now()) {
        this._clientDataCallback = this._handleClientData.bind(this)
        this._backendDataCallback = this._handleBackendData.bind(this)
        this._client = socket
        this._client.setNoDelay(true)
        this._client.on('data', this._clientDataCallback)
        this._client.on('error', e => {
            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by client socket)`)
            this.switchToState(SocketState.CLOSED)
        })
        this._client.on('close', () => this._checkClosed())
        
        this._timeStarted = timeStarted
        this._state = SocketState.HANDSHAKE
        this._version = 0
        this._clientBuffer = Buffer.alloc(config.clientBufferLimit)
        this._backendBuffer = Buffer.alloc(config.backendBufferLimit)
        this._clientBufferOffset = 0
        this._backendBufferOffset = 0
        this._clientPackets = 0
        
        this._clientTimeoutTimer = setTimeout(() => {
            if (this._state === SocketState.HANDSHAKE) {
                if (OPT_LOG_VERBOSE) logEvent(this, 'Handshake timed out')
                this.switchToState(SocketState.CLOSED)
            }
        }, config.handshakeTimeout * 1000)
        
        this._closureTimeoutTimer = setTimeout(() => {
            this._checkClosed()
            logEvent(this, 'ATTENTION! Socket left in a processing-phase state. Possible bug in the code!')
            this.switchToState(SocketState.CLOSED)
        }, 30000)
    }
    
    private _handleClientData(b: Buffer) {
        if (OPT_LOG_DEBUG) {
            logEvent(this,
                (!config.logInspectBufferLimit || (b.length < config.logInspectBufferLimit)) ?
                    `(C) received ${b.length} B chunk: ${b.toString('hex')}` :
                    `(C) received ${b.length} B chunk`)
        }
        
        if (this._state !== SocketState.FORWARD && this._state !== SocketState.CLOSING && this._state !== SocketState.CLOSED) {
            if ((this._clientBufferOffset + b.length) > config.clientBufferLimit) {
                if (OPT_LOG_VERBOSE) logEvent(this, `(C) client didn't send handshake packet within the first ${config.clientBufferLimit} bytes`)
                this.switchToState(SocketState.CLOSED)
                return
            }
            if (config.clientPacketsLimit && (this._clientPackets >= config.clientPacketsLimit)) {
                if (OPT_LOG_VERBOSE) logEvent(this, `(C) client sent too many packets (limit is ${config.clientPacketsLimit})`)
                this.switchToState(SocketState.CLOSED)
                return
            }
            b.copy(this._clientBuffer, this._clientBufferOffset)
            this._clientBufferOffset += b.length
            
            while (this._clientBufferOffset > 0) {
                let parseResult: IncomingPacketParseResult
                try {
                    if (this._state === SocketState.HANDSHAKE) parseResult = parseIncomingPacket(this._clientBuffer, this._clientBufferOffset, 0, IncomingPacketSource.CLIENT)
                    else if (this._state === SocketState.STATUS) parseResult = parseIncomingPacket(this._clientBuffer, this._clientBufferOffset, 1, IncomingPacketSource.CLIENT)
                    else if (this._state === SocketState.LOGIN) parseResult = parseIncomingPacket(this._clientBuffer, this._clientBufferOffset, 2, IncomingPacketSource.CLIENT)
                    else break
                } catch (e) {
                    if ((e as Error).message && OPT_LOG_DEBUG) {
                        if (OPT_LOG_VERBOSE) logEvent(this, `(C) failed to parse packet: ${(e as Error).message}`)
                    }
                    break
                }
                const { packet, end } = parseResult
                this._clientBuffer.copyWithin(0, end) // move data to the left
                this._clientBufferOffset -= end
                this._clientBuffer.fill(0x00, this._clientBufferOffset)
                this._clientPackets++
                this._handleClientPacket(packet)
            }
        }
    }
    
    private _handleBackendData(b: Buffer) {
        if (OPT_LOG_DEBUG) {
            logEvent(this,
                (!config.logInspectBufferLimit || (b.length < config.logInspectBufferLimit)) ?
                    `(B) received ${b.length} B chunk: ${b.toString('hex')}` :
                    `(B) received ${b.length} B chunk`)
        }
        
        if (this._state !== SocketState.FORWARD && this._state !== SocketState.CLOSING && this._state !== SocketState.CLOSED) {
            if ((this._backendBufferOffset + b.length) > config.backendBufferLimit) {
                if (OPT_LOG_VERBOSE) logEvent(this, `(B) backend didn't send the expected data within the first ${config.backendBufferLimit} bytes`)
                this.switchToState(SocketState.CLOSED)
                return
            }
            b.copy(this._backendBuffer, this._backendBufferOffset)
            this._backendBufferOffset += b.length
            
            while (this._backendBufferOffset > 0) {
                let parseResult: IncomingPacketParseResult
                try {
                    if (this._state === SocketState.STATUS) parseResult = parseIncomingPacket(this._backendBuffer, this._backendBufferOffset, 1, IncomingPacketSource.BACKEND)
                    else break
                } catch (e) {
                    if ((e as Error).message && OPT_LOG_DEBUG) {
                        if (OPT_LOG_VERBOSE) logEvent(this, `(B) failed to parse packet: ${(e as Error).message}`)
                    }
                    break
                }
                const { packet, end } = parseResult
                this._backendBuffer.copyWithin(0, end) // move data to the left
                this._backendBufferOffset = 0
                this._backendBuffer.fill(0x00, this._backendBufferOffset)
                this._handleBackendPacket(packet)
            }
        }
    }
    
    private _handleClientPacket(packet: IncomingPacket) {
        if (this._state === SocketState.HANDSHAKE) {
            if (packet.id === 0x00) {
                const handshakePacket = packet as HandshakeIncomingPacket
                const endpoint = config.endpoints.find(x => x.hostname === handshakePacket.address) || config.endpoints.find(x => x.name === '_default')
                if (endpoint) {
                    this._endpoint = endpoint
                    this._version = handshakePacket.version
                    
                    if (endpoint.backend) {
                        // during CONNECT phase packets are kept in buffer
                        this.switchToState(SocketState.CONNECT)
                        
                        let nextState = SocketState.FORWARD
                        const endpointAddress = endpoint.backend.split(':', 2)
                        const forwardPacket = new HandshakeOutgoingPacket(
                            handshakePacket.version,
                            endpoint.rewrite || handshakePacket.address,
                            Number(endpointAddress[1] || '25565'),
                            handshakePacket.nextState
                        )
                        
                        if (handshakePacket.nextState === 1) { // status
                            if (endpoint.motd) {
                                nextState = SocketState.STATUS
                            }
                        }
                        
                        if (OPT_LOG_DEBUG) logEvent(this, `connecting to the backend ${endpoint.backend}`)
                        this._backend = connect({ host: endpointAddress[0], port: Number(endpointAddress[1] || '25565'), timeout: 5000, noDelay: true })
                        this._backend.on('error', e => {
                            if (OPT_LOG_VERBOSE) logEvent(this, `${e.message} (error caused by backend socket)`)
                            this.switchToState(SocketState.CLOSED)
                        })
                        this._backend.on('close', () => this._checkClosed())
                        this._backend.on('connect', () => {
                            if (!this._backend) return
                            if (OPT_LOG_DEBUG) logEvent(this, `backend connected, waiting buffer: ${this._client.writableLength + this._clientBufferOffset} bytes`)
                            this._sendToBackend(forwardPacket) // write modified handshake packet
                            this.switchToState(nextState) // other pending packets are processed here
                        })
                        this._backend.on('timeout', () => {
                            if (OPT_LOG_VERBOSE) logEvent(this, 'connection to the backend server timed out')
                            this.switchToState(SocketState.CLOSED)
                        })
                        if (nextState !== SocketState.FORWARD) {
                            this._backend.on('data', this._backendDataCallback)
                        }
                    } else {
                        if (handshakePacket.nextState === 1) { // status
                            this.switchToState(SocketState.STATUS)
                        } else {
                            this.switchToState(SocketState.LOGIN)
                        }
                    }
                } else {
                    const hostEscaped = handshakePacket.address.substring(0, 16).replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                    if (OPT_LOG_VERBOSE) logEvent(this, `unknown hostname: ${hostEscaped}`)
                    this.switchToState(SocketState.CLOSED)
                }
            }
        } else if (this._state === SocketState.STATUS) {
            if (packet.id === 0x00) {
                this._sendToClient(new StatusResponseOutgoingPacket({
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
                this._sendToClient(new PingResponseOutgoingPacket(packet as PingRequestIncomingPacket))
            }
        } else if (this._state === SocketState.LOGIN) {
            this._sendToClient(new DisconnectOutgoingPacket(this._endpoint?.message || DISCONNECT_MESSAGE_DEFAULT), () => {
                this.switchToState(SocketState.CLOSING)
            })
        }
    }
    
    private _handleBackendPacket(packet: IncomingPacket) {
        if (this._state === SocketState.STATUS) {
            if (packet.id === 0x00) {
                const status = (packet as StatusResponseIncomingPacket).status
                status.description = { text: this._endpoint?.motd || status.description.text }
                this._sendToClient(new StatusResponseOutgoingPacket(status))
            } else if (packet.id === 0x01) {
                this._sendToClient(copyIncomingPacketAsOutgoing(packet))
            }
        }
    }
    
    private _sendToClient(p: OutgoingPacket, cb?: () => void) {
        const b = p.toBuffer()
        if (OPT_LOG_DEBUG) {
            logEvent(this,
                (!config.logInspectBufferLimit || (b.length < config.logInspectBufferLimit)) ?
                    `(C) sending ${b.length} B chunk: ${b.toString('hex')}` :
                    `(C) sending ${b.length} B chunk`)
        }
        this._client.write(b, cb)
    }
    
    private _sendToBackend(p: OutgoingPacket, cb?: () => void) {
        const b = p.toBuffer()
        if (OPT_LOG_DEBUG) {
            logEvent(this,
                (!config.logInspectBufferLimit || (b.length < config.logInspectBufferLimit)) ?
                    `(B) sending ${b.length} B chunk: ${b.toString('hex')}` :
                    `(B) sending ${b.length} B chunk`)
        }
        if (this._backend) this._backend.write(b, cb)
    }
    
    private _checkClosed() {
        if (this._client.readyState === 'closed' && (!this._backend || (this._backend.readyState === 'closed'))) {
            this.switchToState(SocketState.CLOSED)
        }
    }
    
    private _unregisterClientCallbacks() {
        this._client.off('data', this._clientDataCallback)
    }
    
    private _unregisterBackendCallbacks() {
        if (this._backend) this._backend.off('data', this._backendDataCallback)
    }
    
    private _unregisterCallbacks() {
        this._unregisterClientCallbacks()
        this._unregisterBackendCallbacks()
    }
    
    public switchToState(s: SocketState) {
        const switchAndLog = () => {
            if (OPT_LOG_VERBOSE) logEvent(this, `switching state ${this.stateName} -> ${SocketStateNames[s]}`)
            this._state = s
        }
        
        switch (s) {
            case SocketState.HANDSHAKE: throw new Error(`Switching to HANDSHAKE state is forbidden`)
            case SocketState.CONNECT: {
                if (this._state !== SocketState.HANDSHAKE)
                    throw new Error(`Switching to CONNECT state is allowed only from HANDSHAKE state`)
                
                switchAndLog()
                clearTimeout(this._clientTimeoutTimer)
                break
            }
            case SocketState.FORWARD: {
                if (this._state !== SocketState.CONNECT)
                    throw new Error(`Switching to FORWARD state is allowed only from CONNECT state`)
                
                if (!this._backend)
                    throw new Error(`Unable to switch to FORWARD state because backend is not available`)
                
                switchAndLog()
                clearTimeout(this._clientTimeoutTimer)
                clearTimeout(this._closureTimeoutTimer)
                this._unregisterCallbacks()
                this._backend.pipe(this._client)
                this._client.pipe(this._backend)
                this._backend.write(this._clientBuffer.subarray(0, this._clientBufferOffset))
                if (this._clientBuffer.length) this._clientBuffer = Buffer.from([])
                break
            }
            case SocketState.STATUS:
            case SocketState.LOGIN: {
                if (this._backend) {
                    if (this._state !== SocketState.CONNECT)
                        throw new Error(`Switching to ${SocketStateNames[s]} state is allowed only from CONNECT state`)
                    
                    // reading from the client is not needed anymore
                    this._unregisterClientCallbacks()
                    this._client.pipe(this._backend)
                    this._backend.write(this._clientBuffer.subarray(0, this._clientBufferOffset))
                    if (this._clientBuffer.length) this._clientBuffer = Buffer.from([])
                }
                switchAndLog()
                clearTimeout(this._clientTimeoutTimer)
                break
            }
            case SocketState.CLOSING: {
                switchAndLog()
                clearTimeout(this._clientTimeoutTimer)
                this._unregisterCallbacks()
                
                this._client.end()
                if (this._backend) this._backend.end()
                
                // not needed anymore
                if (this._clientBuffer.length) this._clientBuffer = Buffer.from([])
                if (this._backendBuffer.length) this._backendBuffer = Buffer.from([])
                
                break
            }
            case SocketState.CLOSED: {
                switchAndLog()
                clearTimeout(this._clientTimeoutTimer)
                clearTimeout(this._closureTimeoutTimer)
                this._unregisterCallbacks()
                
                if (this._client.readyState !== 'closed' || (this._backend && (this._backend.readyState !== 'closed'))) {
                    this._client.resetAndDestroy()
                    if (this._backend) this._backend.resetAndDestroy()
                }
                
                if (this._clientBuffer.length) this._clientBuffer = Buffer.from([])
                if (this._backendBuffer.length) this._backendBuffer = Buffer.from([])
                
                break
            }
        }
    }
    
    public get client(): Socket {
        return this._client
    }
    
    public get backend(): Socket | undefined {
        return this._backend
    }
    
    public get timeStarted(): number {
        return this._timeStarted
    }
    
    public get state(): SocketState {
        return this._state
    }
    
    public get stateName(): string {
        return SocketStateNames[this._state] || ''
    }
    
    public get endpoint(): EndpointSchema | undefined {
        return this._endpoint
    }
}
