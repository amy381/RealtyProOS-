import { useEffect, useRef } from 'react'

const WAVE_BG_URL = 'https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/wave-bg.jpg'

const NODE_COUNT   = 70
const CONNECT_DIST = 145
const AMBER = '#D4781E'
const TEAL  = '#50C8DC'

function makeNode(w, h) {
  const warm = Math.random() < 0.18
  return {
    x:    Math.random() * w,
    y:    Math.random() * h,
    vx:   (Math.random() - 0.5) * 0.4,
    vy:   (Math.random() - 0.5) * 0.4,
    r:    warm ? 2.8 : 2.2,
    warm,
  }
}

export default function MeshBackground() {
  const canvasRef = useRef(null)
  const nodesRef  = useRef([])
  const rafRef    = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      if (nodesRef.current.length === 0) {
        nodesRef.current = Array.from({ length: NODE_COUNT }, () =>
          makeNode(canvas.width, canvas.height)
        )
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width: w, height: h } = canvas
      ctx.clearRect(0, 0, w, h)

      const nodes = nodesRef.current

      // Move and bounce
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
      }

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[i].x - nodes[j].x
          const dy   = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            const alpha = 1 - dist / CONNECT_DIST
            const isAmber = nodes[i].warm || nodes[j].warm
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            if (isAmber) {
              ctx.strokeStyle = `rgba(200,110,18,${(0.9 * alpha).toFixed(3)})`
            } else {
              ctx.strokeStyle = `rgba(18,95,125,${(0.28 * alpha).toFixed(3)})`
            }
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        if (n.warm) {
          ctx.fillStyle = AMBER
          ctx.shadowColor = 'rgba(212,120,30,0.85)'
          ctx.shadowBlur  = 8
        } else {
          ctx.fillStyle = TEAL
          ctx.shadowColor = 'rgba(80,200,220,0.7)'
          ctx.shadowBlur  = 6
        }
        ctx.fill()
        ctx.shadowBlur = 0
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <>
      {/* Background image layer */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        backgroundImage: `url(${WAVE_BG_URL})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.3,
      }} />
      {/* Animated nodes canvas — sits above the image */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
