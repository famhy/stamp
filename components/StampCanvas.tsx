'use client'

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

export type StampShape = 'auto' | 'circle' | 'square' | 'freehand' | 'points'

interface StampCanvasProps {
  width: number
  height: number
  shape: StampShape
  onStampComplete?: (imageData: ImageData) => void
  onPointsUpdate?: (points: { x: number; y: number }[]) => void
  className?: string
}

export interface StampCanvasRef {
  clearCanvas: () => void
}

export const StampCanvas = forwardRef<StampCanvasRef, StampCanvasProps>(({
  width,
  height,
  shape,
  onStampComplete,
  onPointsUpdate,
  className = ''
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)
  const [contactPoints, setContactPoints] = useState<{ x: number; y: number }[]>([])

  // Clear the canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    setHasContent(false)
    setContactPoints([])
    if (onPointsUpdate) onPointsUpdate([])
  }, [width, height, onPointsUpdate])

  // Expose clearCanvas method to parent via ref
  useImperativeHandle(ref, () => ({
    clearCanvas
  }), [clearCanvas])

  // Draw a circle at the given position (0.5cm approx 20px diameter)
  const drawCircle = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 20) => {
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, 2 * Math.PI)
    ctx.fill()
  }, [])

  // Draw a square at the given position (0.5cm approx 20px)
  const drawSquare = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 20) => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }, [])

  // Draw a point at the given position (using the same 0.5cm size for consistency)
  const drawPoint = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, 2 * Math.PI)
    ctx.fill()
  }, [])

  // Auto-detect and draw the actual contact area
  const drawAutoStamp = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number = 1) => {
    // Standard size of 0.5cm (approx 20px diameter)
    // We can still use pressure to slightly modulate if desired, but base it on 20px
    const baseSize = 20
    const size = baseSize * (0.8 + pressure * 0.4) // Range: 16px to 24px
    
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, 2 * Math.PI)
    ctx.fill()
    
    // Add some variation to make it look more like a real stamp
    if (pressure > 0.5) {
      ctx.beginPath()
      ctx.arc(x, y, (size / 2) * 0.7, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fill()
      ctx.fillStyle = '#000000' // Reset
    }
  }, [])

  // Handle mouse/touch start
  const handleStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setIsDrawing(true)
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const currentPoints: { x: number; y: number }[] = []

    if ('touches' in e) {
      // Multiple touches
      Array.from(e.touches).forEach(touch => {
        const x = (touch.clientX - rect.left) * scaleX
        const y = (touch.clientY - rect.top) * scaleY
        const pressure = (touch as any).force || (touch as any).pressure || 1
        
        if (shape === 'auto') {
          drawAutoStamp(ctx, x, y, pressure)
        } else if (shape === 'circle') {
          drawCircle(ctx, x, y)
        } else if (shape === 'square') {
          drawSquare(ctx, x, y)
        } else if (shape === 'points') {
          drawPoint(ctx, x, y)
        } else if (shape === 'freehand') {
          ctx.beginPath()
          ctx.moveTo(x, y)
        }
        currentPoints.push({ x: Math.round(x), y: Math.round(y) })
      })
    } else {
      // Single mouse click
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY
      
      if (shape === 'auto') {
        drawAutoStamp(ctx, x, y, 1)
      } else if (shape === 'circle') {
        drawCircle(ctx, x, y)
      } else if (shape === 'square') {
        drawSquare(ctx, x, y)
      } else if (shape === 'points') {
        drawPoint(ctx, x, y)
      } else if (shape === 'freehand') {
        ctx.beginPath()
        ctx.moveTo(x, y)
      }
      currentPoints.push({ x: Math.round(x), y: Math.round(y) })
    }

    setContactPoints(prev => {
      const updated = [...prev, ...currentPoints]
      if (onPointsUpdate) onPointsUpdate(updated)
      return updated
    })

    setHasContent(true)
  }, [shape, drawCircle, drawSquare, drawAutoStamp, drawPoint, onPointsUpdate])

  // Handle mouse/touch move
  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    e.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const currentPoints: { x: number; y: number }[] = []

    if ('touches' in e) {
      Array.from(e.touches).forEach(touch => {
        const x = (touch.clientX - rect.left) * scaleX
        const y = (touch.clientY - rect.top) * scaleY
        
        if (shape === 'freehand') {
          ctx.lineTo(x, y)
          ctx.stroke()
        } else if (shape === 'points') {
          drawPoint(ctx, x, y)
        }
        
        if (shape === 'points') {
          currentPoints.push({ x: Math.round(x), y: Math.round(y) })
        }
      })
    } else {
      const x = (e.clientX - rect.left) * scaleX
      const y = (e.clientY - rect.top) * scaleY
      
      if (shape === 'freehand') {
        ctx.lineTo(x, y)
        ctx.stroke()
      } else if (shape === 'points') {
        drawPoint(ctx, x, y)
      }
      
      if (shape === 'points') {
        currentPoints.push({ x: Math.round(x), y: Math.round(y) })
      }
    }

    if (currentPoints.length > 0) {
      setContactPoints(prev => {
        const last = prev[prev.length - 1]
        // Filter out redundant points to avoid flooding
        const novelPoints = currentPoints.filter(p => 
          !last || Math.abs(last.x - p.x) > 2 || Math.abs(last.y - p.y) > 2
        )
        
        if (novelPoints.length > 0) {
          const updated = [...prev, ...novelPoints]
          if (onPointsUpdate) onPointsUpdate(updated)
          return updated
        }
        return prev
      })
    }
  }, [isDrawing, shape, drawPoint, onPointsUpdate])

  // Handle mouse/touch end
  const handleEnd = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    e.preventDefault()
    setIsDrawing(false)

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (shape === 'freehand') {
      ctx.beginPath()
    }

    // Notify parent component that stamping is complete
    if (onStampComplete) {
      const imageData = ctx.getImageData(0, 0, width, height)
      onStampComplete(imageData)
    }
  }, [isDrawing, shape, onStampComplete, width, height])

  // Set up canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Set default styles
    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Clear canvas
    ctx.clearRect(0, 0, width, height)
  }, [width, height])

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        className="border border-gray-300 rounded-lg cursor-crosshair bg-white touch-none"
        style={{ 
          width: '100%', 
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
      {!hasContent && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
          <span className="text-sm">Tap to stamp</span>
        </div>
      )}
    </div>
  )
})

StampCanvas.displayName = 'StampCanvas'
