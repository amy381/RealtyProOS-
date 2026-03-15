import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import transactionsRouter from './routes/transactions.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/transactions', transactionsRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'RealtyPro OS API' })
})

app.listen(PORT, () => {
  console.log(`RealtyPro OS server running on http://localhost:${PORT}`)
})
