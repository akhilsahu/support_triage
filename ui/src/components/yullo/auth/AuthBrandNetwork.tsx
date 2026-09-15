import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  originX: number
  originY: number
  radius: number
  color: string
  opacity: number
  driftAngle: number
  driftSpeed: number
  driftDistance: number
}

interface Pulse {
  fromIdx: number
  toIdx: number
  progress: number
  speed: number
  color: string
}

export function AuthBrandNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let animationFrameId: number
    const resizeCanvas = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const isMobile = window.innerWidth < 768
    const nodeCount = isMobile ? 10 : 26
    const nodeColors = ['#FFDA2D', '#4CD8FF', '#6695FF', '#A98CFF']

    const nodes: Node[] = []
    for (let i = 0; i < nodeCount; i++) {
      let x = Math.random() * canvas.width
      // Concentrate ~60% of nodes around center vertical band (30% - 70%)
      let y: number
      if (Math.random() < 0.6) {
        y = canvas.height * (0.3 + Math.random() * 0.4)
      } else {
        y = Math.random() * canvas.height
      }

      nodes.push({
        x,
        y,
        originX: x,
        originY: y,
        radius: Math.random() * 2 + 3.5,
        color: nodeColors[i % nodeColors.length],
        opacity: Math.random() * 0.35 + 0.4, // 0.4 - 0.75 range
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: Math.random() * 0.0004 + 0.0002, // 2-6px over 8-14s
        driftDistance: Math.random() * 4 + 2,
      })
    }

    const pulses: Pulse[] = []
    let lastPulseTime = 0

    const spawnPulse = (now: number) => {
      if (now - lastPulseTime < 4000) return
      lastPulseTime = now

      const fromIdx = Math.floor(Math.random() * nodes.length)
      const nearby: number[] = []
      nodes.forEach((n, idx) => {
        if (idx === fromIdx) return
        const dist = Math.hypot(n.x - nodes[fromIdx].x, n.y - nodes[fromIdx].y)
        if (dist < 220) nearby.push(idx)
      })

      if (nearby.length > 0) {
        const toIdx = nearby[Math.floor(Math.random() * nearby.length)]
        pulses.push({
          fromIdx,
          toIdx,
          progress: 0,
          speed: 0.008,
          color: nodes[fromIdx].color,
        })
      }
    }

    let startTime = performance.now()

    const render = (time: number) => {
      const elapsed = time - startTime
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (!prefersReducedMotion) {
        nodes.forEach((n) => {
          const t = elapsed * n.driftSpeed
          n.x = n.originX + Math.sin(t + n.driftAngle) * n.driftDistance
          n.y = n.originY + Math.cos(t * 0.8 + n.driftAngle) * n.driftDistance
        })

        spawnPulse(time)
      }

      // Draw connections with improved contrast near brand block
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.hypot(dx, dy)

          if (dist < 200) {
            // Higher line contrast (0.12 - 0.26 range)
            const lineAlpha = (1 - dist / 200) * 0.24
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(102, 149, 255, ${lineAlpha})`
            ctx.lineWidth = 1.2
            ctx.stroke()
          }
        }
      }

      // Draw pulses
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p]
        pulse.progress += pulse.speed
        if (pulse.progress >= 1) {
          pulses.splice(p, 1)
          continue
        }

        const fromNode = nodes[pulse.fromIdx]
        const toNode = nodes[pulse.toIdx]
        const px = fromNode.x + (toNode.x - fromNode.x) * pulse.progress
        const py = fromNode.y + (toNode.y - fromNode.y) * pulse.progress

        ctx.beginPath()
        ctx.arc(px, py, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = pulse.color
        ctx.shadowColor = pulse.color
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // Draw nodes
      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.globalAlpha = n.opacity
        ctx.fill()
        ctx.globalAlpha = 1.0
      })

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
    />
  )
}
