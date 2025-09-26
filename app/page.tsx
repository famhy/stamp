'use client'

import React, { useState, useRef, useCallback } from 'react'
import { StampCanvas, StampShape, StampCanvasRef } from '@/components/StampCanvas'
import { compareCanvases, ComparisonResult, hasContent } from '@/utils/canvasComparison'

export default function Home() {
  const [leftImageData, setLeftImageData] = useState<ImageData | null>(null)
  const [rightImageData, setRightImageData] = useState<ImageData | null>(null)
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)
  const [selectedShape, setSelectedShape] = useState<StampShape>('circle')
  const [tolerance, setTolerance] = useState(0.1)
  
  const leftCanvasRef = useRef<StampCanvasRef>(null)
  const rightCanvasRef = useRef<StampCanvasRef>(null)

  // Handle stamp completion on left canvas
  const handleLeftStampComplete = useCallback((imageData: ImageData) => {
    setLeftImageData(imageData)
    setComparisonResult(null) // Reset comparison when new stamp is made
  }, [])

  // Handle stamp completion on right canvas
  const handleRightStampComplete = useCallback((imageData: ImageData) => {
    setRightImageData(imageData)
    
    // Compare with left canvas if it exists
    if (leftImageData) {
      const result = compareCanvases(leftImageData, imageData, tolerance)
      setComparisonResult(result)
    }
  }, [leftImageData, tolerance])

  // Reset both canvases
  const handleReset = useCallback(() => {
    if (leftCanvasRef.current) {
      leftCanvasRef.current.clearCanvas()
    }
    
    if (rightCanvasRef.current) {
      rightCanvasRef.current.clearCanvas()
    }
    
    setLeftImageData(null)
    setRightImageData(null)
    setComparisonResult(null)
  }, [])

  // Compare existing stamps
  const handleCompare = useCallback(() => {
    if (leftImageData && rightImageData) {
      const result = compareCanvases(leftImageData, rightImageData, tolerance)
      setComparisonResult(result)
    }
  }, [leftImageData, rightImageData, tolerance])

  // Check if both canvases have content
  const bothHaveContent = leftImageData && rightImageData && 
    hasContent(leftImageData) && hasContent(rightImageData)

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Stamp Comparison</h1>
          <p className="text-gray-600">Create two stamps and see if they match!</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Shape Selection */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Shape:</label>
              <select
                value={selectedShape}
                onChange={(e) => setSelectedShape(e.target.value as StampShape)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="circle">Circle</option>
                <option value="square">Square</option>
                <option value="freehand">Freehand</option>
              </select>
            </div>

            {/* Tolerance Slider */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Tolerance:</label>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="text-sm text-gray-600 w-12">
                {Math.round(tolerance * 100)}%
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCompare}
                disabled={!bothHaveContent}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                Compare
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm font-medium"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Comparison Result */}
        {comparisonResult && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className={`text-4xl mb-2 ${comparisonResult.isMatch ? 'text-green-500' : 'text-red-500'}`}>
                  {comparisonResult.isMatch ? '✓' : '✗'}
                </div>
                <div className={`text-lg font-semibold ${comparisonResult.isMatch ? 'text-green-600' : 'text-red-600'}`}>
                  {comparisonResult.isMatch ? 'Match!' : 'No Match'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {comparisonResult.similarity.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Similarity</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {comparisonResult.matchingPixels.toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">
                  of {comparisonResult.totalPixels.toLocaleString()} pixels
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 text-center">
              First Stamp
            </h2>
            <div className="aspect-square">
              <StampCanvas
                ref={leftCanvasRef}
                width={400}
                height={400}
                shape={selectedShape}
                onStampComplete={handleLeftStampComplete}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Right Panel */}
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 text-center">
              Second Stamp
            </h2>
            <div className="aspect-square">
              <StampCanvas
                ref={rightCanvasRef}
                width={400}
                height={400}
                shape={selectedShape}
                onStampComplete={handleRightStampComplete}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Choose a stamp shape from the dropdown</li>
            <li>• Tap or drag on the left canvas to create your first stamp</li>
            <li>• Tap or drag on the right canvas to create your second stamp</li>
            <li>• The app will automatically compare them, or click "Compare" manually</li>
            <li>• Adjust the tolerance slider to make matching more or less strict</li>
            <li>• Use "Reset" to clear both canvases and start over</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
