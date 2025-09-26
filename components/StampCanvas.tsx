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

  // Track contact points for shape detection
  const [contactPoints, setContactPoints] = useState<Array<{x: number, y: number, pressure: number}>>([])
  const [isCapturing, setIsCapturing] = useState(false)

  // Create a more sophisticated shape detection
  const createShapeFromPoints = useCallback((points: Array<{x: number, y: number, pressure: number}>) => {
    if (points.length === 0) return null

    // Sort points by angle from center to create a proper outline
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length
    
    const sortedPoints = points.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX)
      const angleB = Math.atan2(b.y - centerY, b.x - centerX)
      return angleA - angleB
    })

    return { centerX, centerY, points: sortedPoints }
  }, [])

  // Draw the actual contact area shape
  const drawContactArea = useCallback((ctx: CanvasRenderingContext2D, points: Array<{x: number, y: number, pressure: number}>) => {
    if (points.length === 0) return

    const shape = createShapeFromPoints(points)
    if (!shape) return

    ctx.beginPath()
    
    if (points.length === 1) {
      // Single point - draw a circle based on pressure
      const point = points[0]
      const size = 8 + (point.pressure * 15)
      ctx.arc(point.x, point.y, size, 0, 2 * Math.PI)
    } else if (points.length === 2) {
      // Two points - draw an ellipse
      const p1 = points[0]
      const p2 = points[1]
      const centerX = (p1.x + p2.x) / 2
      const centerY = (p1.y + p2.y) / 2
      const radiusX = Math.abs(p2.x - p1.x) / 2 + 8
      const radiusY = Math.abs(p2.y - p1.y) / 2 + 8
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
    } else if (points.length === 3) {
      // Three points - draw a triangle
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[1].x, points[1].y)
      ctx.lineTo(points[2].x, points[2].y)
      ctx.closePath()
    } else {
      // Multiple points - create a smooth outline
      // Use the sorted points to create a proper shape outline
      ctx.moveTo(shape.points[0].x, shape.points[0].y)
      
      // Create smooth curves between points for complex shapes
      for (let i = 1; i < shape.points.length; i++) {
        const current = shape.points[i]
        const previous = shape.points[i - 1]
        
        // Add some smoothing for complex shapes
        const controlX = (previous.x + current.x) / 2
        const controlY = (previous.y + current.y) / 2
        
        if (i === 1) {
          ctx.quadraticCurveTo(controlX, controlY, current.x, current.y)
        } else {
          ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY)
        }
      }
      
      // Close the shape smoothly
      const lastPoint = shape.points[shape.points.length - 1]
      const firstPoint = shape.points[0]
      const controlX = (lastPoint.x + firstPoint.x) / 2
      const controlY = (lastPoint.y + firstPoint.y) / 2
      ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, controlX, controlY)
      ctx.closePath()
    }
    
    ctx.fill()
  }, [createShapeFromPoints])

  // Handle mouse/touch start
  const handleStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setIsDrawing(true)
    setIsCapturing(true)
    setContactPoints([])
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (shape === 'auto') {
      // For auto mode, start capturing contact points
      const newPoints: Array<{x: number, y: number, pressure: number}> = []
      
      if ('touches' in e) {
        // Handle multiple touches for complex shapes
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i]
          const x = (touch.clientX - rect.left) * scaleX
          const y = (touch.clientY - rect.top) * scaleY
          const pressure = (touch as any).force || (touch as any).pressure || 1
          newPoints.push({ x, y, pressure })
        }
      } else {
        // Mouse event
        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY
        newPoints.push({ x, y, pressure: 1 })
      }
      
      setContactPoints(newPoints)
      drawContactArea(ctx, newPoints)
    } else if (shape === 'circle') {
      const x = ('touches' in e) ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX
      const y = ('touches' in e) ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY
      drawCircle(ctx, x, y)
    } else if (shape === 'square') {
      const x = ('touches' in e) ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX
      const y = ('touches' in e) ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY
      drawSquare(ctx, x, y)
    } else if (shape === 'freehand') {
      const x = ('touches' in e) ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX
      const y = ('touches' in e) ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    setHasContent(true)
  }, [shape, drawCircle, drawSquare, drawContactArea])

  // Handle mouse/touch move
  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isCapturing) return
    
    e.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (shape === 'auto') {
      // Continue capturing contact points for complex shapes
      const newPoints: Array<{x: number, y: number, pressure: number}> = []
      
      if ('touches' in e) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i]
          const x = (touch.clientX - rect.left) * scaleX
          const y = (touch.clientY - rect.top) * scaleY
          const pressure = (touch as any).force || (touch as any).pressure || 1
          newPoints.push({ x, y, pressure })
        }
      } else {
        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY
        newPoints.push({ x, y, pressure: 1 })
      }
      
      setContactPoints(prev => [...prev, ...newPoints])
      
      // Redraw the shape with all captured points
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawContactArea(ctx, [...contactPoints, ...newPoints])
    } else if (shape === 'freehand') {
      const x = ('touches' in e) ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX
      const y = ('touches' in e) ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }, [isDrawing, isCapturing, shape, contactPoints, drawContactArea])

  // Handle mouse/touch end
  const handleEnd = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    e.preventDefault()
    setIsDrawing(false)
    setIsCapturing(false)

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (shape === 'freehand') {
      ctx.beginPath()
    }

    // Finalize the shape for auto mode
    if (shape === 'auto' && contactPoints.length > 0) {
      // Draw the final shape with all captured points
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawContactArea(ctx, contactPoints)
    }

    // Notify parent component that stamping is complete
    if (onStampComplete) {
      const imageData = ctx.getImageData(0, 0, width, height)
      onStampComplete(imageData)
    }
  }, [isDrawing, shape, contactPoints, drawContactArea, onStampComplete, width, height])

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
