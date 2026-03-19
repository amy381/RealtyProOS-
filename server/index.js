import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import transactionsRouter from './routes/transactions.js'
import fubRouter          from './routes/fub.js'
import googleRouter       from './routes/google.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, cb) => {
    // Allow any localhost port (Vite increments the port when 5173 is busy)
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true)
    cb(new Error(`CORS: origin not allowed — ${origin}`))
  },
}))
app.use(express.json())

app.use('/api/transactions', transactionsRouter)
app.use('/api/fub', fubRouter)
app.use('/api/google', googleRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LegacyOS API' })
})

app.listen(PORT, () => {
  console.log(`LegacyOS server running on http://localhost:${PORT}`)

  const fubKey = process.env.FUB_API_KEY
  if (fubKey) {
    console.log(`[FUB] API key loaded OK — starts with: ${fubKey.slice(0, 4)}...`)
  } else {
    console.warn('[FUB] WARNING: FUB_API_KEY is NOT set — check server/.env')
  }
})
