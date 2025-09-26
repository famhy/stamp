'use client'

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

export type StampShape = 'auto' | 'circle' | 'square' | 'freehand'

interface StampCanvasProps {
  width: number
  height: number
  shape: StampShape
  onStampComplete?: (imageData: ImageData) => void
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
  className = ''
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasContent, setHasContent] = useState(false)

  // Clear the canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)
    setHasContent(false)
  }, [width, height])

  // Expose clearCanvas method to parent via ref
  useImperativeHandle(ref, () => ({
    clearCanvas
  }), [clearCanvas])

  // Draw a circle at the given position
  const drawCircle = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 30) => {
    ctx.beginPath()
    ctx.arc(x, y, size, 0, 2 * Math.PI)
    ctx.fill()
  }, [])

  // Draw a square at the given position
  const drawSquare = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number = 30) => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }, [])

  // Auto-detect and draw the actual contact area
  const drawAutoStamp = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number = 1) => {
    // Use pressure to determine size - more pressure = larger stamp
    const baseSize = 15
    const size = baseSize + (pressure * 20)
    
    // Create a more realistic stamp shape based on pressure
    ctx.beginPath()
    ctx.arc(x, y, size, 0, 2 * Math.PI)
    ctx.fill()
    
    // Add some variation to make it look more like a real stamp
    if (pressure > 0.5) {
      ctx.beginPath()
      ctx.arc(x, y, size * 0.7, 0, 2 * Math.PI)
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

    let clientX: number, clientY: number
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Get pressure information if available
    let pressure = 1
    if ('touches' in e && e.touches[0]) {
      // Try to get pressure from touch event
      pressure = (e.touches[0] as any).force || (e.touches[0] as any).pressure || 1
    }

    if (shape === 'auto') {
      drawAutoStamp(ctx, x, y, pressure)
    } else if (shape === 'circle') {
      drawCircle(ctx, x, y)
    } else if (shape === 'square') {
      drawSquare(ctx, x, y)
    } else if (shape === 'freehand') {
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    setHasContent(true)
  }, [shape, drawCircle, drawSquare, drawAutoStamp])

  // Handle mouse/touch move
  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    e.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    let clientX: number, clientY: number
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (shape === 'freehand') {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }, [isDrawing, shape])

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
