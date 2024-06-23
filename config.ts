import * as fs from 'fs'
import { parse } from 'yaml'

export const VERSION_NAME_DEFAULT = '1.20.4'
export const DISCONNECT_MESSAGE_DEFAULT = 'Disconnected'

interface EndpointYamlSchema {
    /**
     * match endpoint by given hostname in the handshake
     * 
     * default: none
     */
    hostname?: string
    
    /**
     * backend server address in format "hostname_or_ip[:port]"
     *
     * default: none
     */
    backend?: string
    
    /**
     * rewrite hostname in the handshake to the given value
     * if an endpoint with this value as 'hostname' exists, mcproxy will use that endpoint's backend
     *
     * default: none
     */
    rewrite?: string
    
    /**
     * overwrite server motd
     * if the backend is configured, mcproxy will wait for the status response from the backend and replace the motd with this value,
     * otherwise new status response is forged by mcproxy
     *
     * default: none
     */
    motd?: string
    
    /**
     * Minecraft version name sent in the status response
     * same behavior as {@link motd}
     *
     * default: {@link VERSION_NAME_DEFAULT}
     */
    version?: string
    
    /**
     * disconnect reason sent if the backend is not configured
     *
     * default: {@link DISCONNECT_MESSAGE_DEFAULT}
     */
    message?: string
}

interface ConfigYamlSchema {
    settings?: {
        /**
         * maximum entries in rate-limiter cache
         * if the cache exceeds this size, mcproxy will exit with an error code
         *
         * default: 1024
         */
        'cache-size'?: number
        
        /**
         * time in seconds to wait for a handshake packet from the client
         * timed out socket will be closed with TCP RST
         *
         * default: 5
         */
        'handshake-timeout'?: number
        
        /**
         * maximum bytes to read from each open socket waiting for handshake packet
         * socket exceeding this limit will be closed with TCP RST
         *
         * default: 1024
         */
        'handshake-buffer-limit'?: number
        
        /**
         * maximum number of packets to accept from the client
         * socket exceeding this limit will be closed with TCP RST
         *
         * default: 8
         */
        'client-packets-limit'?: number
        
        /**
         * time in seconds to wait for an expected data from the backend in context of intercepting and altering data
         * failure to receive data will result in both ends (client and backend) being closed with TCP FIN
         *
         * default: 5
         */
        'backend-timeout'?: number
        
        /**
         * maximum bytes to read from the backend waiting for expected data in context of intercepting and altering data
         * failure to receive data will result in both ends (client and backend) being closed with TCP FIN
         *
         * default: 2048 (subject to  change)
         */
        'backend-buffer-limit'?: number
        
        /**
         * time in seconds since the first observed connection from a single IP address before rate-limit counter is reset
         *
         * default: 60
         * 
         * @see cache-size
         * @see rate-limit
         */
        'rate-limit-window'?: number
        
        /**
         * maximum number of connections within {@link rate-limit-window} from a single IP address
         * sockets exceeding this limit will be closed with TCP RST
         *
         * default: 10
         */
        'rate-limit'?: number
        
        /**
         * maximum number of concurrent connections from a single IP address
         * sockets exceeding this limit will be closed with TCP RST
         *
         * default: 0
         */
        'concurrent-limit'?: number
        
        /**
         * maximum number of total open connections
         *
         * default: 0
         */
        'clients-limit'?: number
        
        /**
         * port number to listen on
         *
         * default: 25565
         */
        listen?: number
        
        /**
         * verbosity level of console output
         * 
         * none - disable all connection-related logs (recommended for high traffic servers)
         * connection - log each socket open or close event
         * verbose - log decisions taken by mcproxy
         * debug - log everything
         *
         * default: connection
         */
        log?: 'none' | 'connection' | 'verbose' | 'debug'
        
        /**
         * maximum size of buffer to log to the console if the log level is set to 'debug'
         *
         * default: 1024
         */
        'log-inspect-buffer-limit'?: number
    }
    endpoints?: {
        [name: string]: EndpointYamlSchema
    }
    blocklist?: string[]
}

export interface EndpointSchema {
    name: string
    rewrite: string
    hostname: string
    backend: string
    motd: string
    message: string
    version: string
}

export interface ConfigSchema {
    listen: number
    log: 'none' | 'connection' | 'verbose' | 'debug'
    logInspectBufferLimit: number
    cacheSize: number
    handshakeTimeout: number
    handshakeBufferLimit: number
    clientPacketsLimit: number
    backendTimeout: number
    backendBufferLimit: number
    rateLimitWindow: number
    rateLimit: number
    concurrentLimit: number
    clientsLimit: number
    endpoints: EndpointSchema[]
    blocklist: string[]
}

const file = fs.readFileSync('./config.yml', 'utf-8')
const configYaml = parse(file) as ConfigYamlSchema

export const config: ConfigSchema = (() => {
    const numericDefault = (a: number | undefined, b: number): number => (a || (a === 0)) ? a : b
    const config: ConfigSchema = {
        listen: Number(configYaml.settings?.['listen'] || process.env.OPT_LISTEN_PORT || 25565),
        log: configYaml.settings?.['log'] || 'connection',
        logInspectBufferLimit: numericDefault(configYaml.settings?.['log-inspect-buffer-limit'], 1024),
        cacheSize: configYaml.settings?.['cache-size'] || 1024,
        handshakeTimeout: configYaml.settings?.['handshake-timeout'] || 5,
        handshakeBufferLimit: configYaml.settings?.['handshake-buffer-limit'] || 1024,
        clientPacketsLimit: numericDefault(configYaml.settings?.['client-packets-limit'], 8),
        backendTimeout: configYaml.settings?.['backend-timeout'] || 5,
        backendBufferLimit: configYaml.settings?.['backend-buffer-limit'] || 2048, // todo: if icon is used, status payload may be bigger
        rateLimitWindow: configYaml.settings?.['rate-limit-window'] || 60,
        rateLimit: configYaml.settings?.['rate-limit'] || 10,
        concurrentLimit: configYaml.settings?.['concurrent-limit'] || 0,
        clientsLimit: configYaml.settings?.['clients-limit'] || 0,
        endpoints: configYaml.endpoints ? Object.entries(configYaml.endpoints).map(([k, v]) => ({
            name: k,
            rewrite: v.rewrite || '',
            hostname: v.hostname || '',
            backend: v.backend || '',
            motd: v.motd || '',
            message: v.message || '',
            version: v.version || VERSION_NAME_DEFAULT
        })) : [],
        blocklist: configYaml.blocklist || []
    }
    
    config.endpoints.forEach(x => {
        const rewrite = configYaml!.endpoints?.[x.name]!.rewrite
        if (rewrite) {
            const rewriteEndpoint = config.endpoints.find(x => x.hostname === rewrite)
            if (rewriteEndpoint) x.backend = rewriteEndpoint.backend
        }
    })
    
    return Object.freeze(config)
})()

export const OPT_LOG_DEBUG = config.log === 'debug'
export const OPT_LOG_VERBOSE = OPT_LOG_DEBUG || (config.log === 'verbose')
export const OPT_LOG_CONNECTIONS = OPT_LOG_VERBOSE || (config.log === 'connection')
