"use client"

import { useEffect, useRef } from "react"

/**
 * Animated gradient background using a canvas-based shader effect.
 * Renders smooth, slowly-moving gradient blobs with a grain overlay.
 */
export function WorkspaceShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
    }

    const blobs = [
      { x: 0.25, y: 0.3, r: 0.35, color: [139, 92, 246], speed: 0.3 },   // violet
      { x: 0.7, y: 0.2, r: 0.3, color: [59, 130, 246], speed: 0.4 },     // blue
      { x: 0.5, y: 0.7, r: 0.4, color: [236, 72, 153], speed: 0.25 },    // pink
      { x: 0.15, y: 0.6, r: 0.25, color: [245, 158, 11], speed: 0.35 },  // amber
      { x: 0.8, y: 0.75, r: 0.28, color: [16, 185, 129], speed: 0.32 },  // emerald
    ]

    const draw = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      time += 0.003

      // Dark base
      ctx.fillStyle = "#0a0a0c"
      ctx.fillRect(0, 0, w, h)

      // Draw gradient blobs
      for (const blob of blobs) {
        const offsetX = Math.sin(time * blob.speed + blob.x * 10) * w * 0.08
        const offsetY = Math.cos(time * blob.speed * 0.7 + blob.y * 10) * h * 0.06
        const cx = blob.x * w + offsetX
        const cy = blob.y * h + offsetY
        const radius = blob.r * Math.min(w, h)

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        const [r, g, b] = blob.color
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`)
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.06)`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
      }

      // Subtle vignette
      const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7)
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.4)")
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, w, h)

      animationId = requestAnimationFrame(draw)
    }

    resize()
    draw()

    window.addEventListener("resize", resize)
    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  )
}
