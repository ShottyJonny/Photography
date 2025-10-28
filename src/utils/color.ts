export async function averageColor(src: string): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = 16, h = 16
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no-ctx')
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 16) continue
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
        }
        if (count === 0) throw new Error('empty')
        resolve({ r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) })
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('load-failed'))
    img.src = src
  })
}
