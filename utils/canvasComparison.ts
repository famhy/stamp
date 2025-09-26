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
  tolerance: number = 0.1
): ComparisonResult {
  const { data: data1, width: width1, height: height1 } = imageData1;
  const { data: data2, width: width2, height: height2 } = imageData2;

  // Check if dimensions match
  if (width1 !== width2 || height1 !== height2) {
    return {
      similarity: 0,
      isMatch: false,
      tolerance,
      totalPixels: Math.max(width1 * height1, width2 * height2),
      matchingPixels: 0,
    };
  }

  const totalPixels = width1 * height1;
  let matchingPixels = 0;

  // Compare pixels
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i];
    const g1 = data1[i + 1];
    const b1 = data1[i + 2];
    const a1 = data1[i + 3];

    const r2 = data2[i];
    const g2 = data2[i + 1];
    const b2 = data2[i + 2];
    const a2 = data2[i + 3];

    // Calculate color difference (more lenient)
    const colorDiff =
      Math.sqrt(
        Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
      ) / Math.sqrt(3 * Math.pow(255, 2)); // Normalize to 0-1

    // Calculate alpha difference (more lenient)
    const alphaDiff = Math.abs(a1 - a2) / 255;

    // More lenient matching - consider both pixels as "content" if either has alpha > 0
    const hasContent1 = a1 > 0;
    const hasContent2 = a2 > 0;

    // If both pixels are transparent, they match
    if (!hasContent1 && !hasContent2) {
      matchingPixels++;
    }
    // If both pixels have content, check color similarity
    else if (hasContent1 && hasContent2) {
      const maxColorDiff = tolerance * 2; // More lenient color matching
      const maxAlphaDiff = tolerance * 2; // More lenient alpha matching

      if (colorDiff <= maxColorDiff && alphaDiff <= maxAlphaDiff) {
        matchingPixels++;
      }
    }
    // If only one has content, it's a partial match (count as half match)
    else if (hasContent1 || hasContent2) {
      matchingPixels += 0.5;
    }
  }

  const similarity = (matchingPixels / totalPixels) * 100;
  const isMatch = similarity >= (1 - tolerance) * 100;

  return {
    similarity,
    isMatch,
    tolerance,
    totalPixels,
    matchingPixels,
  };
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
