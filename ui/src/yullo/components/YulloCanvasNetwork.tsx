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
  phase: number
  drift: number
}

interface Pulse {
  fromNode: number
  toNode: number
  progress: number
  duration: number
  color: string
}

export function YulloCanvasNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerPreference = window.matchMedia('(hover: hover) and (pointer: fine)')
    let reducedMotion = motionPreference.matches
    let width = window.innerWidth
    let height = window.innerHeight
    let scrollProgress = 0
    let mouse = { x: -1000, y: -1000 }
    let animationFrameId: number | null = null
    let previousTime: number | null = null
    let elapsed = 0
    let nextPulseAt = 600
    const isMobile = width < 768
    const maxDistance = isMobile ? 120 : 170
    const nodeCount = isMobile ? 32 : 72
    const nodeColors = ['#0891B2', '#3B82F6', '#8B5CF6', '#D9A900']
    const nodes: Node[] = []
    const pulses: Pulse[] = []

    const sizeSurface = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }
    sizeSurface()

    for (let i = 0; i < nodeCount; i++) {
      let x = Math.random() * width
      let y = Math.random() * height

      // Leave the main reading area quieter than the surrounding network.
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
      const active = i % 6 === 0
      const radius = active ? 7 : Math.random() * 2.5 + 3
      const opacity = Math.random() * 0.2 + 0.55
      nodes.push({
        x, y, originX: x, originY: y, baseRadius: radius, currentRadius: radius,
        color: nodeColors[i % nodeColors.length], opacity, targetOpacity: opacity, active,
        phase: Math.random() * Math.PI * 2,
        drift: (isMobile ? 4 : 7) + Math.random() * 4,
      })
    }

    const spawnPulse = () => {
      if (pulses.length >= (isMobile ? 2 : 4)) return
      const fromNode = Math.floor(Math.random() * nodes.length)
      const nearby = nodes.flatMap((node, index) => index !== fromNode &&
        Math.hypot(node.x - nodes[fromNode].x, node.y - nodes[fromNode].y) < maxDistance ? [index] : [])
      if (!nearby.length) return
      pulses.push({
        fromNode, toNode: nearby[Math.floor(Math.random() * nearby.length)], progress: 0,
        duration: 1400 + Math.random() * 600, color: nodes[fromNode].color,
      })
    }

    const requestDraw = () => {
      if (animationFrameId === null && !document.hidden) animationFrameId = requestAnimationFrame(render)
    }

    function render(time: number) {
      if (!ctx || !canvas) return
      animationFrameId = null
      if (document.hidden) return
      // Time-based movement has the same speed on 60 Hz and 120 Hz displays.
      const delta = previousTime === null ? 16 : Math.min(time - previousTime, 48)
      previousTime = time
      if (!reducedMotion) elapsed += delta
      const follow = reducedMotion ? 1 : 1 - Math.exp(-delta / 160)
      ctx.clearRect(0, 0, width, height)

      let globalOpacity = 0.75
      if (scrollProgress > 0.14 && scrollProgress <= 0.30) globalOpacity = 0.45
      else if (scrollProgress > 0.30 && scrollProgress <= 0.45) globalOpacity = 0.65
      else if (scrollProgress > 0.45 && scrollProgress <= 0.60) globalOpacity = 0.75
      else if (scrollProgress > 0.60 && scrollProgress <= 0.72) globalOpacity = 0.85
      else if (scrollProgress > 0.72 && scrollProgress <= 0.86) globalOpacity = 0.95
      else if (scrollProgress > 0.86) globalOpacity = 1

      const pointerEnabled = pointerPreference.matches && !reducedMotion
      nodes.forEach((node, index) => {
        const pull = scrollProgress > 0.85 ? (scrollProgress - 0.85) * 0.35 : 0
        const anchorX = node.originX + (width / 2 - node.originX) * pull
        const anchorY = node.originY + (height / 2 - node.originY) * pull
        const driftX = reducedMotion ? 0 : Math.sin(elapsed / (14000 + index % 4 * 1600) * Math.PI * 2 + node.phase) * node.drift
        const driftY = reducedMotion ? 0 : Math.cos(elapsed / (18000 + index % 5 * 1200) * Math.PI * 2 + node.phase) * node.drift * 0.7
        const proximity = pointerEnabled ? Math.max(0, 1 - Math.hypot(mouse.x - anchorX, mouse.y - anchorY) / 140) : 0
        const targetX = anchorX + driftX + (mouse.x - anchorX) * proximity * 0.06
        const targetY = anchorY + driftY + (mouse.y - anchorY) * proximity * 0.06
        node.x += (targetX - node.x) * follow
        node.y += (targetY - node.y) * follow
        const breathing = reducedMotion ? 1 : 1 + Math.sin(elapsed / 6000 * Math.PI * 2 + node.phase) * 0.08
        const targetRadius = node.baseRadius * (proximity > 0 ? 1 + proximity * 0.35 : breathing)
        node.currentRadius += (targetRadius - node.currentRadius) * follow
        const targetOpacity = (proximity > 0 ? 0.9 : node.targetOpacity) * globalOpacity
        node.opacity += (targetOpacity - node.opacity) * follow
      })

      // Connections follow their endpoints as the nodes drift.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const first = nodes[i]
          const second = nodes[j]
          const distance = Math.hypot(first.x - second.x, first.y - second.y)
          if (distance >= maxDistance) continue
          const mouseDistance = Math.hypot(mouse.x - (first.x + second.x) / 2, mouse.y - (first.y + second.y) / 2)
          const proximity = pointerEnabled ? Math.max(0, 1 - mouseDistance / 140) * 0.3 : 0
          const alpha = ((1 - distance / maxDistance) * 0.28 + proximity) * globalOpacity
          ctx.beginPath()
          ctx.moveTo(first.x, first.y)
          ctx.lineTo(second.x, second.y)
          ctx.strokeStyle = `rgba(67, 107, 180, ${alpha})`
          ctx.lineWidth = proximity > 0 ? 1.6 : 1.2
          ctx.stroke()
        }
      }

      if (!reducedMotion && elapsed >= nextPulseAt) {
        spawnPulse()
        nextPulseAt = elapsed + (isMobile ? 2000 : 1400)
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i]
        pulse.progress += delta / pulse.duration
        if (pulse.progress >= 1) {
          pulses.splice(i, 1)
          continue
        }
        const first = nodes[pulse.fromNode]
        const second = nodes[pulse.toNode]
        const x = first.x + (second.x - first.x) * pulse.progress
        const y = first.y + (second.y - first.y) * pulse.progress
        const tail = Math.max(0, pulse.progress - 0.16)
        ctx.beginPath()
        ctx.moveTo(first.x + (second.x - first.x) * tail, first.y + (second.y - first.y) * tail)
        ctx.lineTo(x, y)
        ctx.strokeStyle = pulse.color
        ctx.lineWidth = 2
        ctx.globalAlpha = globalOpacity * 0.45
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = pulse.color
        ctx.shadowColor = pulse.color
        ctx.shadowBlur = 8
        ctx.globalAlpha = globalOpacity
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      nodes.forEach(node => {
        if (node.active && !reducedMotion) {
          const ripple = (elapsed / 3600 + node.phase / (Math.PI * 2)) % 1
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.currentRadius + 3 + ripple * 12, 0, Math.PI * 2)
          ctx.strokeStyle = node.color
          ctx.lineWidth = 1
          ctx.globalAlpha = node.opacity * (1 - ripple) * 0.4
          ctx.stroke()
        }
        if (node.active || pointerEnabled && Math.hypot(mouse.x - node.x, mouse.y - node.y) < 140) {
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
      if (!reducedMotion) requestDraw()
    }

    const handleScroll = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight
      scrollProgress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0
      if (reducedMotion) requestDraw()
    }
    const handleResize = () => {
      const nextWidth = window.innerWidth
      const nextHeight = window.innerHeight
      nodes.forEach(node => {
        node.originX *= nextWidth / width
        node.originY *= nextHeight / height
        node.x *= nextWidth / width
        node.y *= nextHeight / height
      })
      width = nextWidth
      height = nextHeight
      sizeSurface()
      handleScroll()
      requestDraw()
    }
    const handleMouseMove = (event: MouseEvent) => {
      if (!pointerPreference.matches || reducedMotion) return
      mouse = { x: event.clientX, y: event.clientY }
    }
    const resetPointer = () => { mouse = { x: -1000, y: -1000 } }
    const handleMotionChange = () => {
      reducedMotion = motionPreference.matches
      pulses.length = 0
      nextPulseAt = elapsed + 600
      previousTime = null
      resetPointer()
      requestDraw()
    }
    const handleVisibility = () => {
      if (document.hidden && animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      previousTime = null
      if (!document.hidden) requestDraw()
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseleave', resetPointer)
    motionPreference.addEventListener('change', handleMotionChange)
    pointerPreference.addEventListener('change', resetPointer)
    document.addEventListener('visibilitychange', handleVisibility)
    handleScroll()
    requestDraw()

    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', resetPointer)
      motionPreference.removeEventListener('change', handleMotionChange)
      pointerPreference.removeEventListener('change', resetPointer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-75 transition-opacity duration-700"
    />
  )
}
