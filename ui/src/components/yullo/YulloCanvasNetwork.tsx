import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  originX: number
  originY: number
  baseRadius: number
  currentRadius: number
  color: string
  opacity: number
  targetOpacity: number
  active: boolean
}

interface Pulse {
  fromNode: number
  toNode: number
  progress: number
  speed: number
  color: string
}

export function YulloCanvasNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1000, y: -1000 })
  const scrollRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const isMobile = width < 768
    const nodeCount = isMobile ? 32 : 72
    const nodeColors = ['#4CD8FF', '#6695FF', '#A98CFF', '#FFDA2D']

    // Generate stationary nodes with higher density across canvas
    const nodes: Node[] = []
    for (let i = 0; i < nodeCount; i++) {
      let x = Math.random() * width
      let y = Math.random() * height

      // Balanced central clearance (keep core readable while filling outer areas)
      const minX = width * 0.35
      const maxX = width * 0.65
      const minY = height * 0.3
      const maxY = height * 0.7

      if (x > minX && x < maxX && y > minY && y < maxY) {
        if (Math.random() > 0.3) {
          x = Math.random() > 0.5 ? Math.random() * minX : maxX + Math.random() * (width - maxX)
        } else {
          y = Math.random() > 0.5 ? Math.random() * minY : maxY + Math.random() * (height - maxY)
        }
      }

      const isImportant = i % 6 === 0
      const radius = isImportant ? 7 : Math.random() * 2.5 + 3

      nodes.push({
        x,
        y,
        originX: x,
        originY: y,
        baseRadius: radius,
        currentRadius: radius,
        color: nodeColors[i % nodeColors.length],
        opacity: Math.random() * 0.25 + 0.35,
        targetOpacity: Math.random() * 0.25 + 0.35,
        active: isImportant,
      })
    }

    const pulses: Pulse[] = []

    const spawnPulse = () => {
      if (nodes.length < 2) return
      const fromIdx = Math.floor(Math.random() * nodes.length)
      const nearby: number[] = []
      nodes.forEach((n, idx) => {
        if (idx === fromIdx) return
        const dist = Math.hypot(n.x - nodes[fromIdx].x, n.y - nodes[fromIdx].y)
        if (dist < 240) nearby.push(idx)
      })

      if (nearby.length > 0) {
        const toIdx = nearby[Math.floor(Math.random() * nearby.length)]
        pulses.push({
          fromNode: fromIdx,
          toNode: toIdx,
          progress: 0,
          speed: Math.random() * 0.018 + 0.008,
          color: nodes[fromIdx].color,
        })
      }
    }

    const pulseInterval = setInterval(spawnPulse, 2400)

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? window.scrollY / docHeight : 0
      scrollRef.current = Math.min(1, Math.max(0, progress))
    }

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      const scrollPct = scrollRef.current

      // Calculate Scroll Phase Opacity Multiplier:
      // Hero (0-15%): ~0.7
      // Old Internet (15-35%): ~0.15 (almost silent)
      // Aura/Next (35-60%): ~0.6 (awakening)
      // Network (60-85%): ~0.9 (expanded)
      // Final CTA (85-100%): ~0.95 (converging toward Y logo)
      let globalOpacityMult = 0.7
      if (scrollPct > 0.15 && scrollPct <= 0.35) {
        globalOpacityMult = 0.15
      } else if (scrollPct > 0.35 && scrollPct <= 0.6) {
        globalOpacityMult = 0.65
      } else if (scrollPct > 0.6) {
        globalOpacityMult = 0.95
      }

      // Draw connection lines
      const maxDistance = isMobile ? 120 : 170
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i]
          const n2 = nodes[j]
          const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y)

          if (dist < maxDistance) {
            const midX = (n1.x + n2.x) / 2
            const midY = (n1.y + n2.y) / 2
            const mouseDist = Math.hypot(mouseRef.current.x - midX, mouseRef.current.y - midY)
            const mouseProximity = mouseDist < 140 ? (1 - mouseDist / 140) * 0.3 : 0

            const lineAlpha = ((1 - dist / maxDistance) * 0.15 + mouseProximity) * globalOpacityMult
            ctx.beginPath()
            ctx.moveTo(n1.x, n1.y)
            ctx.lineTo(n2.x, n2.y)
            ctx.strokeStyle = `rgba(102, 149, 255, ${lineAlpha})`
            ctx.lineWidth = mouseProximity > 0 ? 1.5 : 1
            ctx.stroke()
          }
        }
      }

      // Draw traveling pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.progress += p.speed
        if (p.progress >= 1) {
          pulses.splice(i, 1)
          continue
        }

        const n1 = nodes[p.fromNode]
        const n2 = nodes[p.toNode]
        if (!n1 || !n2) continue

        const px = n1.x + (n2.x - n1.x) * p.progress
        const py = n1.y + (n2.y - n1.y) * p.progress

        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.globalAlpha = globalOpacityMult
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      // Draw & update nodes
      const centerX = width / 2
      const centerY = height / 2

      nodes.forEach(node => {
        // At final CTA (scrollPct > 0.85), nodes shift slightly toward center Y logo
        if (scrollPct > 0.85) {
          const pull = (scrollPct - 0.85) * 0.35
          node.x = node.originX + (centerX - node.originX) * pull
          node.y = node.originY + (centerY - node.originY) * pull
        } else {
          node.x = node.originX
          node.y = node.originY
        }

        const mouseDist = Math.hypot(mouseRef.current.x - node.x, mouseRef.current.y - node.y)
        const isHovered = mouseDist < 140

        const targetRadius = isHovered ? node.baseRadius * 1.35 : node.baseRadius
        const targetOpacity = (isHovered ? 0.9 : node.targetOpacity) * globalOpacityMult

        node.currentRadius += (targetRadius - node.currentRadius) * 0.1
        node.opacity += (targetOpacity - node.opacity) * 0.1

        if (node.active || isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.currentRadius * 2.2, 0, Math.PI * 2)
          ctx.fillStyle = node.color
          ctx.globalAlpha = node.opacity * 0.3
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.currentRadius, 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.globalAlpha = node.opacity
        ctx.fill()
        ctx.globalAlpha = 1
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      clearInterval(pulseInterval)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-90 transition-opacity duration-700"
    />
  )
}
