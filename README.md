# mcproxy

mcproxy is a simple proxy service that allows connection to the server only through specific hostname

## Configuration

mcproxy is currently using following environment variables

| name             | type   | default        | description                                               |
|------------------|--------|----------------|-----------------------------------------------------------|
| OPT_LISTEN_PORT  | number | 25565          | port on which proxy listens for incoming connections      |
| OPT_BACKEND_PORT | number | 25566          | port on which underlying Minecraft server is listening    |
| OPT_ACCEPT_HOST  | string | (empty string) | hostname which must be used when connecting to the server |

## Installation

1. install dependencies with `npm i`
2. start service with `npm run start`
3. that's it ^^
