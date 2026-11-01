import { expect, test } from "bun:test"
import { Effect, Layer, Logger } from "effect"
import { Overlay, layer } from "../ts/index.ts"

test("without a Wayland display, the overlay logs a warning and the program carries on", async () => {
  const warnings: Array<string> = []
  const capture = Logger.layer([Logger.make(({ logLevel, message }) => {
    if (logLevel === "Warn") warnings.push(String(message))
  })])

  const result = await Effect.gen(function* () {
    const overlay = yield* Overlay
    yield* overlay.phase("listening")
    yield* overlay.level(0.5)
    return "transcript"
  }).pipe(Effect.provide(layer({ display: "overlay-test-missing" }).pipe(Layer.provide(capture))), Effect.runPromise)

  expect(result).toBe("transcript")
  expect(warnings.join("\n")).toContain("no Wayland display at")
})
