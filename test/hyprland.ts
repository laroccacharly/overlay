// A nested Hyprland, opened as a window inside the running session, for end-to-end tests.
import { Effect, Schedule, Schema } from "effect"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CONFIG = `
monitor = , preferred, auto, 1
misc {
  disable_hyprland_logo = true
  disable_splash_rendering = true
}
animations {
  enabled = false
}
`

export class HyprlandError extends Schema.TaggedError<HyprlandError>()("HyprlandError", {
  message: Schema.String,
}) {}

const runtimeDir = process.env["XDG_RUNTIME_DIR"] ?? ""

// The Wayland socket of the instance whose lock file names `pid`: Hyprland writes its pid, then its socket.
const socketOf = (pid: number) =>
  Effect.tryPromise({
    try: async () => {
      const root = join(runtimeDir, "hypr")
      for (const instance of await readdir(root)) {
        const lines = (await readFile(join(root, instance, "hyprland.lock"), "utf8").catch(() => "")).split("\n")
        if (lines[0] === String(pid) && lines[1]) return { instance: join(root, instance), display: lines[1] }
      }
      throw new Error(`Hyprland ${pid} has no Wayland socket yet`)
    },
    catch: (error) => new HyprlandError({ message: String(error) }),
  }).pipe(Effect.retry({ schedule: Schedule.spaced("100 millis"), times: 50 }))

// Starts a nested Hyprland and yields its Wayland socket name; stops it when the scope closes.
export const nestedHyprland = Effect.acquireRelease(
  Effect.gen(function* () {
    const dir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "overlay-e2e-")))
    const config = join(dir, "hyprland.conf")
    yield* Effect.promise(() => writeFile(config, CONFIG))
    const process = Bun.spawn(["Hyprland", "-c", config], { stdout: "ignore", stderr: "ignore" })
    const found = yield* socketOf(process.pid).pipe(Effect.onError(() => Effect.sync(() => process.kill())))
    return { process, dir, ...found }
  }),
  ({ process, dir, instance }) =>
    Effect.promise(async () => {
      process.kill()
      await process.exited
      await rm(dir, { recursive: true, force: true })
      await rm(instance, { recursive: true, force: true })
    })
)

export interface Screen {
  readonly width: number
  readonly height: number
  // RGB, row by row.
  readonly pixels: Uint8Array
}

// Captures the whole output of `display` with grim, as raw pixels.
export const screenshot = (display: string) =>
  Effect.sync(() => {
    const grim = Bun.spawnSync(["grim", "-t", "ppm", "-"], { env: { ...process.env, WAYLAND_DISPLAY: display } })
    // PPM: "P6\n<width> <height>\n255\n" then the pixels.
    const header = new TextDecoder().decode(grim.stdout.subarray(0, 32)).split(/\s+/)
    const width = Number(header[1])
    const height = Number(header[2])
    const offset = grim.stdout.length - width * height * 3
    return { width, height, pixels: grim.stdout.subarray(offset) }
  })

// Saves a PNG of `display` for a human to look at.
export const savePng = (display: string, path: string) =>
  Effect.sync(() => {
    Bun.spawnSync(["grim", path], { env: { ...process.env, WAYLAND_DISPLAY: display } })
  })
