export const OPT_LISTEN_PORT = Number(process.env.OPT_LISTEN_PORT || 25565)
export const OPT_BACKEND_PORT = Number(process.env.OPT_BACKEND_PORT || 25566)
export const OPT_ACCEPT_HOST = (process.env.OPT_ACCEPT_HOST || '').split(',')
export const OPT_RATE_LIMIT = Number(process.env.OPT_RATE_LIMIT || 16)
export const OPT_RATE_LIMIT_WINDOW = Number(process.env.OPT_RATE_LIMIT_WINDOW || 60000)
export const OPT_CONCURRENT_LIMIT = Number(process.env.OPT_CONCURRENT_LIMIT || 4)
export const OPT_LOG_VERBOSE = process.env.OPT_LOG_VERBOSE === 'true'
