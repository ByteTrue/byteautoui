/**
 * RGB to HSB/HSV conversion
 */
export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSB {
  h: number
  s: number
  b: number
}

export function rgbToHSB(r: number, g: number, b: number): HSB {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  const s = max === 0 ? 0 : delta / max
  const v = max

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6
    } else {
      h = ((r - g) / delta + 4) / 6
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    b: Math.round(v * 100),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * RGB to OpenCV HSB (different range)
 * OpenCV: H=[0,180], S=[0,255], V=[0,255]
 */
export function rgbToOpenCVHSB(r: number, g: number, b: number): { h: number; s: number; b: number } {
  const hsb = rgbToHSB(r, g, b)
  return {
    h: Math.round(hsb.h / 2), // 0-180
    s: Math.round(hsb.s * 255 / 100), // 0-255
    b: Math.round(hsb.b * 255 / 100), // 0-255
  }
}
