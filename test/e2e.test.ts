import { describe, expect, test } from "bun:test"
import { Effect, Option, Schedule, Schema } from "effect"
import { mkdir } from "node:fs/promises"
import { Overlay, layer } from "../ts/index.ts"
import { nestedHyprland, savePng, type Screen, screenshot } from "./hyprland.ts"

class NotShown extends Schema.TaggedError<NotShown>()("NotShown", { message: Schema.String }) {}

type Colour = "blue" | "purple" | "green"

interface Bars {
  readonly counts: Record<Colour, number>
  // Bounding box of all bar pixels, as fractions of the screen.
  readonly box: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
}

const colourOf = (r: number, g: number, b: number): Option.Option<Colour> => {
  if (b > 200 && r < 120 && g > 150) return Option.some("blue")
  if (b > 200 && r > 150 && g < 150) return Option.some("purple")
  if (g > 200 && b < 220 && r < 150) return Option.some("green")
  return Option.none()
}

// Finds the overlay's bar pixels by colour, wherever they are on screen.
const bars = (screen: Screen): Bars => {
  const counts = { blue: 0, purple: 0, green: 0 }
  let [left, right, top, bottom] = [screen.width, 0, screen.height, 0]
  for (let pixel = 0; pixel < screen.width * screen.height; pixel++) {
    const [r = 0, g = 0, b = 0] = screen.pixels.subarray(pixel * 3, pixel * 3 + 3)
    const colour = colourOf(r, g, b)
    if (Option.isNone(colour)) continue
    counts[colour.value]++
    const [x, y] = [pixel % screen.width, Math.floor(pixel / screen.width)]
    ;[left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)]
  }
  const box = { left: left / screen.width, right: right / screen.width, top: top / screen.height, bottom: bottom / screen.height }
  return { counts, box }
}

// Screenshots until `check` passes, for up to 3 seconds: the overlay fades in and out.
const until = (display: string, check: (counts: Record<Colour, number>) => boolean) =>
  screenshot(display).pipe(
    Effect.map(bars),
    Effect.filterOrFail(
      (found) => check(found.counts),
      (found) => new NotShown({ message: `overlay shows ${JSON.stringify(found.counts)}` })
    ),
    Effect.retry({ schedule: Schedule.spaced("100 millis"), times: 30 })
  )

const hasHyprland = Boolean(process.env["WAYLAND_DISPLAY"]) && Bun.which("Hyprland") !== null && Bun.which("grim") !== null

describe.skipIf(!hasHyprland)("overlay in a nested Hyprland", () => {
  test("shows the waveform while listening, turns green when finishing, then fades out", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { display } = yield* nestedHyprland
          yield* Effect.promise(() => mkdir("screenshots", { recursive: true }))

          yield* Effect.gen(function* () {
            const overlay = yield* Overlay
            yield* overlay.phase("listening")
            for (let i = 0; i < 48; i++) yield* overlay.level(Math.abs(Math.sin(i / 5)))
            const listening = yield* until(display, (c) => c.blue > 200 && c.purple > 200)
            // Centred along the bottom edge.
            expect(Math.abs(listening.box.left + listening.box.right - 1)).toBeLessThan(0.05)
            expect(listening.box.top).toBeGreaterThan(0.5)
            yield* savePng(display, "screenshots/listening.png")

            yield* overlay.phase("finishing")
            yield* until(display, (c) => c.green > 200 && c.purple === 0)
            yield* savePng(display, "screenshots/finishing.png")
          }).pipe(Effect.provide(layer({ display })))

          // The layer's scope has closed: the overlay faded out before it returned.
          const after = bars(yield* screenshot(display))
          expect(after.counts).toEqual({ blue: 0, purple: 0, green: 0 })
        })
      )
    ), 15_000)
})
