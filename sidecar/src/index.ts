import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { chatApp } from './routes/chat'

const root = new Hono()

root.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
)

root.route('/', chatApp)

const port = Number(process.env.SIDECAR_PORT ?? 8765)
console.log(`SIDECAR_READY:${port}`)

export default {
  port,
  fetch: root.fetch,
}
