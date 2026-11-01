import { expect, test } from "bun:test"
import { type Phase, renderFrame } from "../ts/index.ts"

const LEVELS = Array.from({ length: 48 }, (_, i) => Math.abs(Math.sin(i / 5)))

// Frames are compared byte for byte with test/snapshots; UPDATE_SNAPSHOTS=1 rewrites them after a visual change.
test.each<Phase>(["connecting", "listening", "finishing"])("%s frame matches its snapshot", async (phase) => {
  const png = renderFrame(phase, LEVELS, 2)
  const view = new DataView(png.buffer, png.byteOffset)
  // 360x64 at scale 2, from the PNG header.
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([720, 128])

  const path = `test/snapshots/${phase}.png`
  if (process.env["UPDATE_SNAPSHOTS"] === "1" || !(await Bun.file(path).exists())) await Bun.write(path, png)
  expect(Buffer.compare(png, await Bun.file(path).bytes())).toBe(0)
})
