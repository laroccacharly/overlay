//! Node-API bindings: the API TypeScript sees, generated into `index.d.ts`.

mod overlay;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;

/// What the overlay shows: grey ripple, live audio, then green ripple.
#[napi(string_enum = "lowercase")]
pub enum Phase {
    Connecting,
    Listening,
    Finishing,
}

impl From<Phase> for overlay::Phase {
    fn from(phase: Phase) -> Self {
        match phase {
            Phase::Connecting => overlay::Phase::Connecting,
            Phase::Listening => overlay::Phase::Listening,
            Phase::Finishing => overlay::Phase::Finishing,
        }
    }
}

#[napi(object)]
pub struct SpawnOptions {
    /// Wayland socket name or path; defaults to `$WAYLAND_DISPLAY`.
    pub display: Option<String>,
}

/// The overlay, drawn on its own thread until closed.
#[napi]
pub struct Indicator {
    overlay: Option<overlay::Overlay>,
}

fn to_napi(error: &anyhow::Error) -> Error {
    Error::from_reason(format!("{error:#}"))
}

#[napi]
impl Indicator {
    /// Shows the overlay. A Wayland failure is reported by `close`, not here.
    #[napi(factory)]
    pub fn spawn(options: Option<SpawnOptions>) -> Result<Self> {
        let display: Option<String> = options.and_then(|options| options.display);
        let overlay: overlay::Overlay = overlay::Overlay::spawn(display).map_err(|e| to_napi(&e))?;
        Ok(Self {
            overlay: Some(overlay),
        })
    }

    /// Pushes the loudness of the latest audio chunk, `0..=1`.
    #[napi]
    pub fn level(&self, value: f64) {
        self.send(overlay::Event::Level(value as f32));
    }

    #[napi]
    pub fn phase(&self, phase: Phase) {
        self.send(overlay::Event::Phase(phase.into()));
    }

    /// Fades out; resolves once the overlay is gone, rejects if it failed.
    /// Later calls resolve at once.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn close(&mut self) -> AsyncTask<Close> {
        AsyncTask::new(Close(self.overlay.take()))
    }
}

impl Indicator {
    fn send(&self, event: overlay::Event) {
        if let Some(overlay) = &self.overlay {
            overlay.send(event);
        }
    }
}

/// Joins the overlay thread on the libuv pool, off the JavaScript thread.
pub struct Close(Option<overlay::Overlay>);

impl Task for Close {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<()> {
        self.0
            .take()
            .map_or(Ok(()), |overlay| overlay.close().map_err(|e| to_napi(&e)))
    }

    fn resolve(&mut self, _: Env, _: ()) -> Result<()> {
        Ok(())
    }
}

/// One still frame as a PNG. `levels` fill the bars from the right.
#[napi]
pub fn render_frame(phase: Phase, levels: Vec<f64>, scale: Option<u32>) -> Result<Buffer> {
    let levels: Vec<f32> = levels.into_iter().map(|level| level as f32).collect();
    overlay::render_png(phase.into(), &levels, scale.unwrap_or(1).max(1))
        .map(Buffer::from)
        .map_err(|e| to_napi(&e))
}
