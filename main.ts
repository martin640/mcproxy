import { Server, Socket } from 'net'
import { ProxySocket } from './src/ProxySocket'
import { config, OPT_LOG_CONNECTIONS, OPT_LOG_VERBOSE } from './config'
import { logEvent } from './src/Logger'

let openSockets: Socket[] = []
let connectionIpCounter: [ string, number, number ][] = []

const server = new Server({ noDelay: true })
server.on('connection', socket => {
    const now = performance.now()
    if (!socket.remoteAddress) {
        socket.resetAndDestroy()
        return
    }
    
    const address = socket.remoteAddress
    const addressWithPort = `${socket.remoteAddress}:${socket.remotePort}`
    
    if (config.clientsLimit && (openSockets.length >= config.clientsLimit)) {
        if (OPT_LOG_VERBOSE) logEvent(addressWithPort, 'clients-limit reached')
        socket.resetAndDestroy()
        return
    }
    
    if (config.blocklist.includes(address)) {
        if (OPT_LOG_VERBOSE) logEvent(addressWithPort, 'blocklist')
        socket.resetAndDestroy()
        return
    }
    
    connectionIpCounter = connectionIpCounter.filter(x => x[2] > (Date.now() - (config.rateLimitWindow * 1000)))
    const counter = connectionIpCounter.find(x => x[0] === address)
    
    if ((counter?.[1] || 0) >= config.rateLimit) {
        if (OPT_LOG_VERBOSE) logEvent(addressWithPort, `rate-limit (current ${counter?.[1]})`)
        socket.resetAndDestroy()
    } else {
        if (counter) counter[1]++
        else connectionIpCounter.push([address, 1, Date.now()])
        
        const openSocketsByIP = openSockets.filter(x => x.remoteAddress === address).length
        if (openSocketsByIP >= config.concurrentLimit) {
            if (OPT_LOG_VERBOSE) logEvent(addressWithPort, `max concurrent connections exceeded (current ${openSocketsByIP})`)
            socket.resetAndDestroy()
        } else {
            openSockets.push(socket)
            const proxySocket = new ProxySocket(socket, now)
            if (OPT_LOG_CONNECTIONS) logEvent(proxySocket, 'peer connected')
            socket.on('close', () => {
                openSockets = openSockets.filter(x => x !== socket)
                if (OPT_LOG_CONNECTIONS) logEvent(proxySocket, 'peer disconnected')
            })
        }
    }
})

server.listen(config.listen, '0.0.0.0', () => {
    console.log('mcproxy is ready')
})
