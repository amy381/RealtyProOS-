import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import transactionsRouter from './routes/transactions.js'
import fubRouter from './routes/fub.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/transactions', transactionsRouter)
app.use('/api/fub', fubRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'RealtyPro OS API' })
})

app.listen(PORT, () => {
  console.log(`RealtyPro OS server running on http://localhost:${PORT}`)

  const fubKey = process.env.FUB_API_KEY
  if (fubKey) {
    console.log(`[FUB] API key loaded OK — starts with: ${fubKey.slice(0, 4)}...`)
  } else {
    console.warn('[FUB] WARNING: FUB_API_KEY is NOT set — check server/.env')
  }
})
