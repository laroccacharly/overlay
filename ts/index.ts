import { type Cause, Context, Effect, Layer } from "effect"
import { Indicator, type Phase, type SpawnOptions } from "../native/index.js"

export { renderFrame } from "../native/index.js"
export type { Phase, SpawnOptions }

export class Overlay extends Context.Service<
  Overlay,
  {
    // Loudness of the latest audio chunk, 0 to 1; scrolls in from the right while listening.
    readonly level: (value: number) => Effect.Effect<void>
    readonly phase: (phase: Phase) => Effect.Effect<void>
  }
>()("overlay/Overlay") {}

// Shows the overlay for the layer's lifetime and fades it out when the scope closes.
// The overlay is cosmetic: when it cannot start or fails, it logs a warning and the program carries on.
export const layer = (options?: SpawnOptions): Layer.Layer<Overlay> =>
  Layer.effect(
    Overlay,
    Effect.acquireRelease(
      Effect.try(() => Indicator.spawn(options)),
      (indicator) => Effect.tryPromise(() => indicator.close()).pipe(Effect.catch(warn))
    ).pipe(
      Effect.map((indicator) =>
        Overlay.of({
          level: (value) => Effect.sync(() => indicator.level(value)),
          phase: (phase) => Effect.sync(() => indicator.phase(phase)),
        })
      ),
      Effect.catch((error) => warn(error).pipe(Effect.as(Overlay.of({ level: () => Effect.void, phase: () => Effect.void }))))
    )
  )

const warn = (error: Cause.UnknownError) => Effect.logWarning("overlay failed", error.cause)
