import { useEffect, useRef } from 'react'

interface Node {
  id: number
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
  isActivated: boolean
  vx: number
  vy: number
}

interface Pulse {
  fromNode: number
  toNode: number
  progress: number
  speed: number
  color: string
}

export function YulloNetworkBackground({ 
  stepIndex, 
  activations = 0 
}: { 
  stepIndex: number, 
  activations?: number 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const nodesRef = useRef<Node[]>([])

  // Determine target node count: start with a much denser base around edges
  const targetNodeCount = 45 + (stepIndex * 8)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = canvas.width = window.innerWidth
    let height = canvas.height = window.innerHeight

    const nodeColors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#FFFC00']
    const isMobile = window.innerWidth < 768

    // Initialize or grow nodes array safely
    if (nodesRef.current.length < targetNodeCount) {
      for (let i = nodesRef.current.length; i < targetNodeCount; i++) {
        const edge = i % 4
        let x = 0, y = 0
        if (edge === 0) { x = Math.random() * (width * 0.15); y = Math.random() * height }
        else if (edge === 1) { x = width - Math.random() * (width * 0.15); y = Math.random() * height }
        else if (edge === 2) { x = Math.random() * width; y = Math.random() * (height * 0.15) }
        else { x = Math.random() * width; y = height - Math.random() * (height * 0.15) }

        const isImportant = i % 8 === 0
        const radius = isImportant ? 5 : Math.random() * 2 + 3

        nodesRef.current.push({
          id: i,
          x,
          y,
          originX: x,
          originY: y,
          baseRadius: radius,
          currentRadius: radius,
          color: nodeColors[i % nodeColors.length],
          opacity: Math.random() * 0.3 + 0.2,
          targetOpacity: Math.random() * 0.3 + 0.2,
          active: isImportant,
          isActivated: false,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
        })
      }
    }

    // Apply activations
    nodesRef.current.forEach((node, i) => {
      node.isActivated = (i < activations) && stepIndex === 2
    })

    const pulses: Pulse[] = []

    const spawnPulse = () => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReducedMotion || nodesRef.current.length < 2) return
      
      const fromIdx = Math.floor(Math.random() * nodesRef.current.length)
      const nearby: number[] = []
      nodesRef.current.forEach((n, idx) => {
        if (idx === fromIdx) return
        const dist = Math.hypot(n.x - nodesRef.current[fromIdx].x, n.y - nodesRef.current[fromIdx].y)
        if (dist < (isMobile ? 180 : 250)) nearby.push(idx)
      })

      if (nearby.length > 0) {
        const toIdx = nearby[Math.floor(Math.random() * nearby.length)]
        pulses.push({
          fromNode: fromIdx,
          toNode: toIdx,
          progress: 0,
          speed: Math.random() * 0.015 + 0.005,
          color: nodesRef.current[fromIdx].color,
        })
      }
    }

    const pulseInterval = setInterval(spawnPulse, 3000)

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

    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      const nodes = nodesRef.current.slice(0, targetNodeCount)
      const maxDistance = isMobile ? 200 : 350 // Keep connections local to leave center empty
      
      // Update nodes subtle drift and mouse repulsion
      nodes.forEach(node => {
        // Base drift
        node.x += node.vx
        node.y += node.vy
        
        // Keep within bounds of origins loosely for base drift
        if (Math.abs(node.x - node.originX) > 20) node.vx *= -1
        if (Math.abs(node.y - node.originY) > 20) node.vy *= -1

        // Mouse repulsion
        const dx = node.x - mouseRef.current.x
        const dy = node.y - mouseRef.current.y
        const dist = Math.hypot(dx, dy)
        if (dist < 180 && dist > 0) {
          const force = (180 - dist) / 180
          node.x += (dx / dist) * force * 5
          node.y += (dy / dist) * force * 5
        } else {
          // Slowly pull back to origin if pushed away
          node.x += (node.originX - node.x) * 0.05
          node.y += (node.originY - node.y) * 0.05
        }
      })

      // Draw connection lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i]
          const n2 = nodes[j]
          const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y)

          if (dist < maxDistance) {
            const midX = (n1.x + n2.x) / 2
            const midY = (n1.y + n2.y) / 2
            const mouseDist = Math.hypot(mouseRef.current.x - midX, mouseRef.current.y - midY)
            const mouseProximity = mouseDist < 160 ? (1 - mouseDist / 160) * 0.5 : 0

            // Landing page cyan/blue edge: rgba(102, 149, 255)
            // Make base always visible but fade out at max distance
            const baseAlpha = Math.max(0.15, (1 - dist / maxDistance) * 0.4)
            const finalAlpha = Math.min(baseAlpha + mouseProximity, 1)
            
            ctx.beginPath()
            ctx.moveTo(n1.x, n1.y)
            ctx.lineTo(n2.x, n2.y)
            
            ctx.strokeStyle = `rgba(102, 149, 255, ${finalAlpha})`
            ctx.lineWidth = mouseProximity > 0 ? 1.5 : 0.8
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

        const n1 = nodesRef.current[p.fromNode]
        const n2 = nodesRef.current[p.toNode]
        if (!n1 || !n2) continue

        const px = n1.x + (n2.x - n1.x) * p.progress
        const py = n1.y + (n2.y - n1.y) * p.progress

        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // Draw & update nodes
      nodes.forEach(node => {
        const mouseDist = Math.hypot(mouseRef.current.x - node.x, mouseRef.current.y - node.y)
        const isHovered = mouseDist < 120

        let targetRadius = isHovered ? node.baseRadius * 1.5 : node.baseRadius
        if (node.isActivated) targetRadius = node.baseRadius * 1.8
        
        let targetOpacity = isHovered ? 1.0 : node.targetOpacity
        if (node.isActivated) targetOpacity = 0.9

        node.currentRadius += (targetRadius - node.currentRadius) * 0.1
        node.opacity += (targetOpacity - node.opacity) * 0.1

        // Glow
        if (node.isActivated || isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.currentRadius * 2.5, 0, Math.PI * 2)
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
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(animationFrameId)
    }
  }, [stepIndex, activations, targetNodeCount])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-60 transition-opacity duration-700"
    />
  )
}
