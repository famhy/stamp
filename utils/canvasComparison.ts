/**
 * Utility functions for comparing two canvas ImageData objects
 */

export interface ComparisonResult {
  similarity: number; // Percentage (0-100)
  isMatch: boolean;
  tolerance: number;
  totalPixels: number;
  matchingPixels: number;
}

export type CompareMode =
  | 'pixel'
  | 'shape_iou'
  | 'shape_boundary_iou'
  | 'shape_combined'

export interface CompareOptions {
  mode?: CompareMode
  /**
   * Alpha threshold used to decide if a pixel is "ink"/content.
   * For your current StampCanvas this is usually ~10+.
   */
  alphaThreshold?: number
  /**
   * Normalized mask resolution (square).
   * Lower = faster but less precise.
   */
  maskResolution?: number
  /**
   * Dilation radius (in normalized-mask pixels) before computing overlap.
   */
  dilationRadius?: number
  /**
   * Dilation radius for boundary overlap.
   * If not provided, it uses `dilationRadius`.
   */
  boundaryDilationRadius?: number
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function compareCanvasesPixel(
  imageData1: ImageData,
  imageData2: ImageData,
  tolerance: number
): ComparisonResult {
  const { data: data1, width: width1, height: height1 } = imageData1
  const { data: data2, width: width2, height: height2 } = imageData2

  // Check if dimensions match
  if (width1 !== width2 || height1 !== height2) {
    return {
      similarity: 0,
      isMatch: false,
      tolerance,
      totalPixels: Math.max(width1 * height1, width2 * height2),
      matchingPixels: 0,
    }
  }

  const totalPixels = width1 * height1
  let matchingPixels = 0

  // Compare pixels
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i]
    const g1 = data1[i + 1]
    const b1 = data1[i + 2]
    const a1 = data1[i + 3]

    const r2 = data2[i]
    const g2 = data2[i + 1]
    const b2 = data2[i + 2]
    const a2 = data2[i + 3]

    // Calculate color difference (more lenient)
    const colorDiff =
      Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)) /
      Math.sqrt(3 * Math.pow(255, 2)) // Normalize to 0-1

    // Calculate alpha difference (more lenient)
    const alphaDiff = Math.abs(a1 - a2) / 255

    // More lenient matching - consider both pixels as "content" if either has alpha > 0
    const hasContent1 = a1 > 0
    const hasContent2 = a2 > 0

    // If both pixels are transparent, they match
    if (!hasContent1 && !hasContent2) {
      matchingPixels++
    }
    // If both pixels have content, check color similarity
    else if (hasContent1 && hasContent2) {
      const maxColorDiff = tolerance * 2 // More lenient color matching
      const maxAlphaDiff = tolerance * 2 // More lenient alpha matching

      if (colorDiff <= maxColorDiff && alphaDiff <= maxAlphaDiff) {
        matchingPixels++
      }
    }
    // If only one has content, it's a partial match (count as half match)
    else if (hasContent1 || hasContent2) {
      matchingPixels += 0.5
    }
  }

  const similarity = (matchingPixels / totalPixels) * 100
  const isMatch = similarity >= (1 - tolerance) * 100

  return {
    similarity,
    isMatch,
    tolerance,
    totalPixels,
    matchingPixels,
  }
}

type NormalizedMask = {
  empty: boolean
  mask: Uint8Array // 0/1, length = res*res
}

function computeContentStats(imageData: ImageData, alphaThreshold: number) {
  const { data, width, height } = imageData
  let count = 0
  let sumX = 0
  let sumY = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4
      const a = data[idx + 3]
      if (a > alphaThreshold) {
        count++
        sumX += x
        sumY += y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (count === 0) {
    return { empty: true as const }
  }

  const cx = sumX / count
  const cy = sumY / count
  const w = maxX - minX + 1
  const h = maxY - minY + 1

  return { empty: false as const, count, cx, cy, w, h }
}

function buildNormalizedMask(
  imageData: ImageData,
  res: number,
  alphaThreshold: number
): NormalizedMask {
  const { data, width, height } = imageData
  const stats = computeContentStats(imageData, alphaThreshold)

  if (stats.empty) {
    return { empty: true, mask: new Uint8Array(res * res) }
  }

  const { cx, cy, w, h } = stats
  const scale = (res - 1) / Math.max(w, h)

  const mask = new Uint8Array(res * res)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4
      const a = data[idx + 3]
      if (a <= alphaThreshold) continue

      const nx = Math.round((x - cx) * scale + res / 2)
      const ny = Math.round((y - cy) * scale + res / 2)

      if (nx >= 0 && nx < res && ny >= 0 && ny < res) {
        mask[ny * res + nx] = 1
      }
    }
  }

  return { empty: false, mask }
}

function boundaryMask(src: Uint8Array, res: number) {
  const out = new Uint8Array(res * res)
  const idx = (x: number, y: number) => y * res + x

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = idx(x, y)
      if (src[i] === 0) continue
      // If any 4-neighbor is empty, it's boundary.
      if (
        x === 0 ||
        y === 0 ||
        x === res - 1 ||
        y === res - 1 ||
        src[idx(x - 1, y)] === 0 ||
        src[idx(x + 1, y)] === 0 ||
        src[idx(x, y - 1)] === 0 ||
        src[idx(x, y + 1)] === 0
      ) {
        out[i] = 1
      }
    }
  }

  return out
}

function dilateMask(src: Uint8Array, res: number, radius: number) {
  if (radius <= 0) return src

  const size = res * res
  const dist = new Int32Array(size)
  dist.fill(-1)

  const q = new Int32Array(size)
  let head = 0
  let tail = 0

  for (let i = 0; i < size; i++) {
    if (src[i] === 1) {
      dist[i] = 0
      q[tail++] = i
    }
  }

  while (head < tail) {
    const cur = q[head++]
    const d = dist[cur]
    if (d >= radius) continue
    const cx = cur % res
    const cy = Math.floor(cur / res)

    // 4-neighbor BFS (diamond-shaped dilation).
    const tryPush = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= res || ny >= res) return
      const ni = ny * res + nx
      if (dist[ni] !== -1) return
      dist[ni] = d + 1
      q[tail++] = ni
    }

    tryPush(cx + 1, cy)
    tryPush(cx - 1, cy)
    tryPush(cx, cy + 1)
    tryPush(cx, cy - 1)
  }

  const out = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    if (dist[i] !== -1 && dist[i] <= radius) out[i] = 1
  }
  return out
}

function computeIoU(a: Uint8Array, b: Uint8Array) {
  let intersection = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] === 1
    const bv = b[i] === 1
    if (av || bv) union++
    if (av && bv) intersection++
  }
  return { intersection, union }
}

/**
 * Compare two ImageData objects pixel by pixel
 * @param imageData1 First canvas ImageData
 * @param imageData2 Second canvas ImageData
 * @param tolerance Tolerance for pixel matching (0-1, where 1 = 100% tolerance)
 * @returns ComparisonResult with similarity percentage and match status
 */
export function compareCanvases(
  imageData1: ImageData,
  imageData2: ImageData,
  tolerance: number = 0.1,
  options: CompareOptions = {}
): ComparisonResult {
  const mode = options.mode ?? 'pixel'

  if (mode === 'pixel') {
    return compareCanvasesPixel(imageData1, imageData2, tolerance)
  }

  // Shape modes: compare normalized binary silhouettes.
  const { width: width1, height: height1 } = imageData1
  const { width: width2, height: height2 } = imageData2
  if (width1 !== width2 || height1 !== height2) {
    return {
      similarity: 0,
      isMatch: false,
      tolerance,
      totalPixels: 0,
      matchingPixels: 0,
    }
  }

  const alphaThreshold = options.alphaThreshold ?? 10
  const res = options.maskResolution ?? 128
  const dilationRadius =
    options.dilationRadius ?? Math.max(1, Math.round(tolerance * 4))
  const boundaryDilationRadius =
    options.boundaryDilationRadius ?? dilationRadius

  const m1 = buildNormalizedMask(imageData1, res, alphaThreshold)
  const m2 = buildNormalizedMask(imageData2, res, alphaThreshold)

  if (m1.empty && m2.empty) {
    return {
      similarity: 100,
      isMatch: true,
      tolerance,
      totalPixels: 0,
      matchingPixels: 0,
    }
  }
  if (m1.empty || m2.empty) {
    return {
      similarity: 0,
      isMatch: false,
      tolerance,
      totalPixels: res * res,
      matchingPixels: 0,
    }
  }

  const m1Dilated = dilateMask(m1.mask, res, dilationRadius)
  const m2Dilated = dilateMask(m2.mask, res, dilationRadius)

  const iou = computeIoU(m1Dilated, m2Dilated)
  const iouScore = iou.union === 0 ? 0 : (iou.intersection / iou.union) * 100

  const b1 = boundaryMask(m1Dilated, res)
  const b2 = boundaryMask(m2Dilated, res)
  const b1Dilated = dilateMask(b1, res, boundaryDilationRadius)
  const b2Dilated = dilateMask(b2, res, boundaryDilationRadius)

  const boundaryIou = computeIoU(b1Dilated, b2Dilated)
  const boundaryScore =
    boundaryIou.union === 0 ? 0 : (boundaryIou.intersection / boundaryIou.union) * 100

  let similarity: number
  let totalPixels: number
  let matchingPixels: number

  if (mode === 'shape_iou') {
    similarity = iouScore
    totalPixels = iou.union
    matchingPixels = iou.intersection
  } else if (mode === 'shape_boundary_iou') {
    similarity = boundaryScore
    totalPixels = boundaryIou.union
    matchingPixels = boundaryIou.intersection
  } else {
    // shape_combined
    similarity = 0.65 * iouScore + 0.35 * boundaryScore
    totalPixels = iou.union
    matchingPixels = iou.intersection
  }

  // Higher tolerance => more lenient match threshold.
  const threshold = clamp(80 - tolerance * 40, 35, 90)
  const isMatch = similarity >= threshold

  return {
    similarity,
    isMatch,
    tolerance,
    totalPixels,
    matchingPixels,
  }
}

/**
 * Convert ImageData to a simplified representation for debugging
 * @param imageData Canvas ImageData
 * @returns Object with basic statistics
 */
export function getImageDataStats(imageData: ImageData): {
  width: number;
  height: number;
  totalPixels: number;
  nonTransparentPixels: number;
  averageAlpha: number;
} {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  let nonTransparentPixels = 0;
  let totalAlpha = 0;

  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    totalAlpha += alpha;
    if (alpha > 0) {
      nonTransparentPixels++;
    }
  }

  return {
    width,
    height,
    totalPixels,
    nonTransparentPixels,
    averageAlpha: totalAlpha / totalPixels,
  };
}

/**
 * Check if an ImageData has any visible content
 * @param imageData Canvas ImageData
 * @returns true if there's visible content, false otherwise
 */
export function hasContent(imageData: ImageData): boolean {
  const { data } = imageData;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      // Alpha channel > 0 means visible
      return true;
    }
  }

  return false;
}
