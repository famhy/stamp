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
    setContactPoints([])
    setTouchHistory([])
    setIsCapturing(false)
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
  const [contactPoints, setContactPoints] = useState<Array<{x: number, y: number, pressure: number, timestamp: number}>>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [touchHistory, setTouchHistory] = useState<Array<{x: number, y: number, pressure: number, timestamp: number}>>([])

  // Advanced convex hull algorithm for better shape detection
  const convexHull = useCallback((points: Array<{x: number, y: number, pressure: number}>) => {
    if (points.length < 3) return points

    // Sort points by x-coordinate, then by y-coordinate
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    
    // Build lower hull
    const lower: Array<{x: number, y: number, pressure: number}> = []
    for (const point of sorted) {
      while (lower.length >= 2 && 
             ((lower[lower.length - 1].x - lower[lower.length - 2].x) * (point.y - lower[lower.length - 2].y) - 
              (lower[lower.length - 1].y - lower[lower.length - 2].y) * (point.x - lower[lower.length - 2].x)) <= 0) {
        lower.pop()
      }
      lower.push(point)
    }
    
    // Build upper hull
    const upper: Array<{x: number, y: number, pressure: number}> = []
    for (let i = sorted.length - 1; i >= 0; i--) {
      const point = sorted[i]
      while (upper.length >= 2 && 
             ((upper[upper.length - 1].x - upper[upper.length - 2].x) * (point.y - upper[upper.length - 2].y) - 
              (upper[upper.length - 1].y - upper[upper.length - 2].y) * (point.x - upper[upper.length - 2].x)) <= 0) {
        upper.pop()
      }
      upper.push(point)
    }
    
    // Remove duplicates and combine
    lower.pop()
    upper.pop()
    return [...lower, ...upper]
  }, [])

  // Create optimized shape from points
  const createShapeFromPoints = useCallback((points: Array<{x: number, y: number, pressure: number}>) => {
    if (points.length === 0) return null

    // Use convex hull for better shape detection
    const hullPoints = convexHull(points)
    
    // Calculate center
    const centerX = hullPoints.reduce((sum, p) => sum + p.x, 0) / hullPoints.length
    const centerY = hullPoints.reduce((sum, p) => sum + p.y, 0) / hullPoints.length
    
    // Sort points by angle from center for smooth drawing
    const sortedPoints = hullPoints.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX)
      const angleB = Math.atan2(b.y - centerY, b.x - centerX)
      return angleA - angleB
    })

    return { centerX, centerY, points: sortedPoints, allPoints: points }
  }, [convexHull])

  // Optimized shape drawing with better pressure mapping
  const drawContactArea = useCallback((ctx: CanvasRenderingContext2D, points: Array<{x: number, y: number, pressure: number}>) => {
    if (points.length === 0) return

    const shape = createShapeFromPoints(points)
    if (!shape) return

    ctx.beginPath()
    
    if (points.length === 1) {
      // Single point - draw a circle based on pressure
      const point = points[0]
      const size = 6 + (point.pressure * 20)
      ctx.arc(point.x, point.y, size, 0, 2 * Math.PI)
    } else if (points.length === 2) {
      // Two points - draw an ellipse
      const p1 = points[0]
      const p2 = points[1]
      const centerX = (p1.x + p2.x) / 2
      const centerY = (p1.y + p2.y) / 2
      const radiusX = Math.abs(p2.x - p1.x) / 2 + 6
      const radiusY = Math.abs(p2.y - p1.y) / 2 + 6
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
    } else if (points.length === 3) {
      // Three points - draw a triangle
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[1].x, points[1].y)
      ctx.lineTo(points[2].x, points[2].y)
      ctx.closePath()
    } else {
      // Multiple points - create optimized outline using convex hull
      if (shape.points.length < 3) return
      
      // Start with first point
      ctx.moveTo(shape.points[0].x, shape.points[0].y)
      
      // Create smooth curves for complex shapes
      for (let i = 1; i < shape.points.length; i++) {
        const current = shape.points[i]
        const previous = shape.points[i - 1]
        
        // Calculate control points for smooth curves
        const controlX = (previous.x + current.x) / 2
        const controlY = (previous.y + current.y) / 2
        
        if (i === 1) {
          ctx.quadraticCurveTo(controlX, controlY, current.x, current.y)
        } else {
          ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY)
        }
      }
      
      // Close the shape smoothly
      if (shape.points.length > 2) {
        const lastPoint = shape.points[shape.points.length - 1]
        const firstPoint = shape.points[0]
        const controlX = (lastPoint.x + firstPoint.x) / 2
        const controlY = (lastPoint.y + firstPoint.y) / 2
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, controlX, controlY)
        ctx.closePath()
      }
    }
    
    ctx.fill()
    
    // Add pressure-based shading for better visual feedback
    if (points.length > 3) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fill()
      ctx.fillStyle = '#000000' // Reset
    }
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
      // For auto mode, start capturing contact points with timestamp
      const newPoints: Array<{x: number, y: number, pressure: number, timestamp: number}> = []
      const now = Date.now()
      
      if ('touches' in e) {
        // Handle multiple touches for complex shapes
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i]
          const x = (touch.clientX - rect.left) * scaleX
          const y = (touch.clientY - rect.top) * scaleY
          const pressure = (touch as any).force || (touch as any).pressure || 0.5
          newPoints.push({ x, y, pressure, timestamp: now })
        }
      } else {
        // Mouse event
        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY
        newPoints.push({ x, y, pressure: 1, timestamp: now })
      }
      
      setContactPoints(newPoints)
      setTouchHistory(prev => [...prev, ...newPoints])
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
      // Continue capturing contact points for complex shapes with better sampling
      const newPoints: Array<{x: number, y: number, pressure: number, timestamp: number}> = []
      const now = Date.now()
      
      if ('touches' in e) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i]
          const x = (touch.clientX - rect.left) * scaleX
          const y = (touch.clientY - rect.top) * scaleY
          const pressure = (touch as any).force || (touch as any).pressure || 0.5
          newPoints.push({ x, y, pressure, timestamp: now })
        }
      } else {
        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY
        newPoints.push({ x, y, pressure: 1, timestamp: now })
      }
      
      // Update contact points and history
      setContactPoints(prev => [...prev, ...newPoints])
      setTouchHistory(prev => [...prev, ...newPoints])
      
      // Redraw the shape with all captured points using convex hull
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const allPoints = [...contactPoints, ...newPoints]
      drawContactArea(ctx, allPoints)
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

    // Finalize the shape for auto mode with all captured points
    if (shape === 'auto' && touchHistory.length > 0) {
      // Draw the final shape with all captured points using convex hull
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawContactArea(ctx, touchHistory)
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
