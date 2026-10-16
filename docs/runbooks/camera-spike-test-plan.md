# Camera spike — device test plan

**Goal (Phase 1 exit):** prove on real iOS and Android phones that capture, landscape guidance, crop, focus/exposure controls, GPS and heading work well enough to build Phase 3 on. Each failure points to a specific fix: a native module, a library change, or a UX change.

## Setup

1. Install the development build (see [HANDWORK.md](../HANDWORK.md) 1.2 for Android, and 1.3 for iPhone on the Mac).
2. On the PC: `pnpm --filter @shootspot/mobile start`, then open the project from the dev build.
3. Do the tests **outdoors** so GPS and the compass behave as they do in the field.
4. For the heading test, use a reference: a compass app with calibration done, or a landmark whose bearing you know from a map.

## Tests

| ID  | Test                                                                                                                 | Pass when                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| C1  | First open: camera permission prompt, then **deny**                                                                  | A clear message is shown; no crash                                                   |
| C2  | Re-open, allow camera; location prompt appears in context, then **deny**                                             | Camera works; status shows "GPS off · pin manually"                                  |
| C3  | Allow location (re-enable in Settings)                                                                               | Accuracy shows `±N m` within ~10 s outdoors                                          |
| C4  | Hold the phone **upright**, 16:9 selected                                                                            | Landscape band mask visible; "Turn your phone sideways" cue shown                    |
| C5  | Rotate to **landscape left** and **landscape right**                                                                 | Cue disappears; mask covers the full long side; button labels rotate to read upright |
| C6  | Toggle **1:1** in both orientations                                                                                  | Square mask, centred                                                                 |
| C7  | **Tap to focus** on a near object, then a far one                                                                    | Focus visibly moves to the tapped point                                              |
| C8  | **EV− / EV+** through the range                                                                                      | Preview brightness changes; buttons are disabled on devices without exposure bias    |
| C9  | **Lens buttons** (0.5× / 1× / 2–5×) and **pinch zoom**                                                               | Lens switches smoothly; no black frames                                              |
| C10 | **Torch** and **Flash off/auto/on** (indoors)                                                                        | Torch lights; flash fires per mode                                                   |
| C11 | **Flip** to the front camera, capture                                                                                | Works; review shows `front`                                                          |
| C12 | Capture **sideways, 16:9**                                                                                           | Review: `Publishable yes · 16:9`, output ≈ landscape, `Held sideways`                |
| C13 | Capture **upright, 16:9**                                                                                            | Review: still landscape (`yes · 16:9`); band matches what the mask showed            |
| C14 | Capture **1:1** both ways                                                                                            | `yes · 1:1`, square                                                                  |
| C15 | **Crop fidelity:** frame a distinct object at the edge of the mask, capture                                          | The object is at the same edge in the review image (±2%)                             |
| C16 | **Heading:** hold the phone upright and point the camera at the reference; read the heading before and after capture | Record the error vs. the reference, in degrees. Repeat at N/E/S/W                    |
| C17 | **Heading sideways:** same as C16 with the phone in landscape                                                        | Record the error. **This is the main known risk on Android** (ADR 0002)              |
| C18 | Capture with **low storage** (if practical) or in **airplane mode**                                                  | Graceful error, no crash                                                             |
| C19 | Background the app during capture; return                                                                            | Camera resumes; no frozen preview                                                    |
| C20 | Turn on **Reduce Motion / large text**                                                                               | Controls are still usable; text is readable                                          |

## Results to send back

| Device / OS | C1–C15 failures | Heading error upright (N/E/S/W) | Heading error sideways (N/E/S/W) | Notes |
| ----------- | --------------- | ------------------------------- | -------------------------------- | ----- |
|             |                 |                                 |                                  |       |

Exit criteria: no failures in C4–C15 on the reference devices, and heading error of 15° or less after calibration in both upright and sideways holds. Above 15°, I'll add the native camera-azimuth module.
