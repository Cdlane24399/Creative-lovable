"use client"

import { useEffect, useRef } from "react"

interface IridescenceBackgroundProps {
  color?: [number, number, number]
  speed?: number
  amplitude?: number
  mouseReact?: boolean
}

export function IridescenceBackground({
  color = [0.8, 0.4, 1],
  speed = 0.6,
  amplitude = 0.12,
  mouseReact = true,
}: IridescenceBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shaderRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const loadShader = async () => {
      const { Renderer, Program, Mesh, Color, Triangle } = await import("ogl")

      const vertexShader = `
        attribute vec2 uv;
        attribute vec2 position;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 0, 1);
        }
      `

      const fragmentShader = `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uResolution;
        uniform vec2 uMouse;
        uniform float uAmplitude;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          float mr = min(uResolution.x, uResolution.y);
          vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
          uv += (uMouse - vec2(0.5)) * uAmplitude;
          float d = -uTime * 0.5 * uSpeed;
          float a = 0.0;
          for (float i = 0.0; i < 8.0; ++i) {
            a += cos(i - d - a * uv.x);
            d += sin(uv.y * i + a);
          }
          d += uTime * 0.5 * uSpeed;
          vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
          col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
          gl_FragColor = vec4(col, 1.0);
        }
      `

      const container = containerRef.current
      if (!container) return

      const renderer = new Renderer()
      const gl = renderer.gl
      gl.clearColor(0, 0, 0, 1)

      const geometry = new Triangle(gl)
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(...color) },
          uResolution: { value: new Color(1, 1, 1) },
          uMouse: { value: new Float32Array([0.5, 0.5]) },
          uAmplitude: { value: amplitude },
          uSpeed: { value: speed },
        },
      })
      const mesh = new Mesh(gl, { geometry, program })

      const resize = () => {
        const rect = container.getBoundingClientRect()
        renderer.setSize(rect.width, rect.height)
        program.uniforms.uResolution.value = new Color(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / gl.canvas.height,
        )
      }

      const onMouseMove = (e: MouseEvent) => {
        if (!mouseReact) return
        const rect = container.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        const y = 1.0 - (e.clientY - rect.top) / rect.height
        program.uniforms.uMouse.value[0] = x
        program.uniforms.uMouse.value[1] = y
      }

      let animationId: number
      const animate = (t = 0) => {
        animationId = requestAnimationFrame(animate)
        program.uniforms.uTime.value = t * 0.001
        renderer.render({ scene: mesh })
      }

      resize()
      window.addEventListener("resize", resize)
      if (mouseReact) {
        container.addEventListener("mousemove", onMouseMove)
      }
      container.appendChild(gl.canvas)
      animate()

      shaderRef.current = {
        destroy: () => {
          cancelAnimationFrame(animationId)
          window.removeEventListener("resize", resize)
          if (mouseReact) {
            container.removeEventListener("mousemove", onMouseMove)
          }
          if (gl.canvas.parentNode) {
            gl.canvas.parentNode.removeChild(gl.canvas)
          }
        },
      }
    }

    loadShader()

    return () => {
      shaderRef.current?.destroy()
    }
  }, [color, speed, amplitude, mouseReact])

  return <div ref={containerRef} className="absolute inset-0 -z-10" />
}
