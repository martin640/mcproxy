import * as fs from 'fs'
import { parse } from 'yaml'

interface EndpointYamlSchema {
    host?: string
    backend?: string
    rewrite?: string
    motd?: string
    message?: string
    version?: string
}

interface ConfigYamlSchema {
    settings?: {
        'cache-size'?: number
        'handshake-timeout'?: number
        'handshake-buffer-limit'?: number
        'rate-limit-window'?: number
        'rate-limit'?: number
        'concurrent-limit'?: number
        'clients-limit'?: number
        listen?: number
        log?: 'none' | 'connection' | 'verbose' | 'debug'
    }
    endpoints?: {
        [name: string]: EndpointYamlSchema
    }
    blocklist?: string[]
}

export interface EndpointSchema {
    name: string
    rewrite: string
    host: string
    backend: string
    motd: string
    message: string
    version: string
}

export interface ConfigSchema {
    listen: number
    log: 'none' | 'connection' | 'verbose' | 'debug'
    cacheSize: number
    handshakeTimeout: number
    handshakeBufferLimit: number
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
    const config: ConfigSchema = {
        listen: Number(configYaml.settings?.['listen'] || process.env.OPT_LISTEN_PORT || 25565),
        log: configYaml.settings?.['log'] || 'connection',
        cacheSize: configYaml.settings?.['cache-size'] || 1024,
        handshakeTimeout: configYaml.settings?.['handshake-timeout'] || 5000,
        handshakeBufferLimit: configYaml.settings?.['handshake-buffer-limit'] || 1024,
        rateLimitWindow: configYaml.settings?.['rate-limit-window'] || 60000,
        rateLimit: configYaml.settings?.['rate-limit'] || 60,
        concurrentLimit: configYaml.settings?.['concurrent-limit'] || 0,
        clientsLimit: configYaml.settings?.['clients-limit'] || 0,
        endpoints: configYaml.endpoints ? Object.entries(configYaml.endpoints).map(([k, v]) => ({
            name: k,
            rewrite: v.rewrite || '',
            host: v.host || '',
            backend: v.backend || '',
            motd: v.motd || '',
            message: v.message || '',
            version: v.version || '1.20.4'
        })) : [],
        blocklist: configYaml.blocklist || []
    }
    
    config.endpoints.forEach(x => {
        const rewrite = configYaml!.endpoints?.[x.name]!.rewrite
        if (rewrite) {
            const rewriteEndpoint = config.endpoints.find(x => x.host === rewrite)
            if (rewriteEndpoint) x.backend = rewriteEndpoint.backend
        }
    })
    
    return Object.freeze(config)
})()

export const OPT_LOG_DEBUG = config.log === 'debug'
export const OPT_LOG_VERBOSE = OPT_LOG_DEBUG || (config.log === 'verbose')
export const OPT_LOG_CONNECTIONS = OPT_LOG_DEBUG || (config.log === 'connection')
