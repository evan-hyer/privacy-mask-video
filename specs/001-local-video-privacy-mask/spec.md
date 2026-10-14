# Feature Specification: Local Video Privacy Mask

**Feature Branch**: `main` (existing branch; no feature branch created)

**Created**: 2026-10-13

**Status**: Draft — validated for planning

**Execution update (2026-10-14)**: The user deferred testing. Implementation may
proceed without the annotated corpus, test-first tasks, calibration or acceptance
checkpoints. Functional requirements remain the target; success criteria below
are unverified until the deferred qualification work resumes.

**Input**: User-provided requirements for a fully client-side application that imports a local video, allows explicit selection of one face in the first valid frame, deterministically tracks it, applies an emoji mask, and downloads the processed video without transmitting media off the device.

**User-mandated delivery constraint (2026-10-13)**: This feature MUST be delivered as a standard Web Component, usable as a custom HTML element in an ordinary web page without a UI framework or application shell.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mask and download a selected face privately (Priority: P1)

As a user, I want to select a face in my local video and download a version covered by an emoji so I can prepare the recording for sharing without uploading sensitive footage.

**Why this priority**: Import, explicit target selection, tracking, masking, and download together provide the minimum useful privacy workflow.

**Independent Test**: Import a supported video containing multiple faces, choose one face, process with the default emoji, download the result, and inspect it frame by frame in an independent player while verifying that media never leaves the device.

**Acceptance Scenarios**:

1. **Given** a supported MP4 or WebM recording, **When** the user chooses it through the file picker or drops it into the import area, **Then** the application displays the first valid frame paused, with selectable boundaries around every detectable face.
2. **Given** a first frame containing multiple detectable faces, **When** the user selects one boundary, **Then** that face is visibly identified as the sole target and processing becomes available; the application does not choose a target automatically.
3. **Given** a selected target that moves, changes apparent size, or tilts its head, **When** the application processes the video, **Then** the emoji follows its position, scale, and in-plane rotation on every processed frame while other faces remain unmasked.
4. **Given** identical input, target selection, settings, and processing environment, **When** processing is repeated three times, **Then** target assignments, tracking statuses, and face coordinates match at each frame.
5. **Given** successful processing, **When** the user downloads the output, **Then** a playable video is saved locally with the chosen mask, original frame order, and original playback timing within the export tolerance in SC-005.
6. **Given** any import, selection, processing, preview, or export operation, **When** network activity is inspected, **Then** no source video, audio, extracted image, face coordinates, or media-derived identifying data is transmitted off the device.

---

### User Story 2 - Recover from missing or lost faces (Priority: P1)

As a user, I want clear feedback when a face cannot be detected or tracked so I can understand where masking needs review.

**Why this priority**: Silent tracking failure could expose the identity the user intended to conceal.

**Independent Test**: Use a video with no initial face detection and another with a selected face that becomes occluded or leaves the scene. Verify manual selection, loss indicators, and deterministic reacquisition without switching people.

**Acceptance Scenarios**:

1. **Given** no face is detected in the initial frame, **When** detection completes, **Then** the user sees a clear notification and can either import another video or draw a bounding box around the intended face.
2. **Given** manual selection is available, **When** the user draws a nonzero box within the frame, **Then** that box becomes the initial target and the application attempts local tracking from it; a zero-size box cannot start processing.
3. **Given** the selected face becomes fully obscured or leaves the frame, **When** tracking loses the target, **Then** the application holds the last-known mask position and clearly labels the affected interval as lost or occluded rather than confirmed tracking.
4. **Given** the target returns after a loss, **When** it can be matched unambiguously to the selected target, **Then** tracking resumes on that target; ambiguous matches remain marked lost rather than silently selecting another person.
5. **Given** a processed video contains lost intervals, **When** the user reviews the result before download, **Then** those intervals are identified by time and the application explains that a held mask may not cover the intended face.

---

### User Story 3 - Choose an emoji and inspect progress (Priority: P2)

As a user, I want to choose the emoji and see masking progress so I can judge the appearance and coverage before downloading.

**Why this priority**: Customization and visible progress make the core workflow understandable and useful across different recordings.

**Independent Test**: With a selected target, choose a preset emoji and then enter a custom emoji, process the clip, and verify that preview and download use the current choice.

**Acceptance Scenarios**:

1. **Given** a selected target, **When** the user chooses a preset or enters one supported emoji, **Then** the initial preview shows that emoji centered over the target at a size that covers the face boundary.
2. **Given** an empty or unsupported custom value, **When** the user applies it, **Then** the application explains the invalid selection and retains the previous valid emoji.
3. **Given** processing is underway, **When** frames complete, **Then** the user sees masked preview frames, progress, and an acquired, lost/occluded, processing, complete, or error status as applicable.
4. **Given** a processed result, **When** the user changes the selected face or emoji, **Then** the previous result is invalidated and the new selection is processed before it is offered for download.
5. **Given** processing is underway, **When** the user cancels, **Then** processing stops responsively, no incomplete file is presented as a finished result, and the user can restart or import another video.

### Edge Cases

- **No detectable initial face**: Show a notification and offer manual bounding-box selection or replacement of the video.
- **Occlusion, departure, or ambiguous re-entry**: Hold last-known coordinates, expose loss status and time intervals, and resume only on an unambiguous match to the original target.
- **Similar-looking faces or crossing paths**: Preserve the selected identity; uncertainty is reported as loss rather than an automatic switch.
- **Unsupported, empty, or corrupted input**: Explain why the file cannot be processed, leave no previous result associated with the new input, and allow another import. A supported container does not imply support for every codec inside it.
- **No decodable frames**: Report that no usable preview can be obtained; keep selection and export unavailable.
- **Face partly outside the image**: Keep the mask aligned to the estimated face and clip rendering to the video boundaries.
- **Manual box lacks usable face landmarks**: Attempt tracking; retain the last valid orientation, initially upright, and report loss if the target cannot be followed.
- **Variable frame timing or rotated source video**: Selection, preview, and output use the same visible orientation and preserve presentation order and timing.
- **Insufficient device resources or export capability**: Show an actionable error, release temporary processing resources, and allow retry with another file. Do not silently upload the video or label a partial export successful.
- **Replacement or cancellation during work**: Stop the previous job; its late results must not overwrite the newly selected video, settings, or preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST accept one local prerecorded video at a time through both a file picker and drag-and-drop, including supported MP4 and WebM files. It MUST identify unsupported or unreadable files with an informative error.
- **FR-002**: The application MUST decode locally and display the first valid frame paused before target selection. It MUST NOT start masking before an explicit target selection.
- **FR-003**: The application MUST detect and display selectable boundaries for all detectable faces in the initial frame, allow selection of exactly one target, and visibly distinguish the selected target. Overlapping candidates MUST be individually selectable.
- **FR-004**: The tracking engine MUST process frames in presentation order and record target position, size, available facial landmarks, orientation, and tracking status for each frame. It MUST follow the selected identity as position, scale, and in-plane rotation change. Repeated processing under the conditions in SC-003 MUST yield the same tracking results.
- **FR-005**: The rendering engine MUST center the chosen emoji on the tracked face and adapt its scale and rotation to head movement. Its opaque rendered coverage MUST enclose the target face boundary; transparent emoji margins MUST NOT be treated as coverage. When an emoji alone leaves gaps, an opaque backing beneath the emoji MUST cover the boundary.
- **FR-006**: The application MUST compile processed frames locally into a downloadable video with the correct extension and media type. It MUST preserve presentation order and timing, report export failures, and offer download only after export completes successfully.
- **FR-007**: When initial detection finds no face, the application MUST offer replacement of the video or manual selection of a valid bounding box as the tracking seed.
- **FR-008**: On target loss, the application MUST hold the last-known mask position, mark tracking as lost/occluded, record the affected time interval, and attempt deterministic reacquisition of the original target. It MUST NOT silently substitute another face. Held coordinates MUST NOT be presented as verified coverage.
- **FR-009**: The application MUST provide a default emoji, a choice of preset emojis, and entry of a single supported custom emoji. The preview and final export MUST use the same selection. Unsupported choices MUST receive clear feedback.
- **FR-010**: During processing, the application MUST display masked preview frames, progress, and tracking status. A frame-progress view is sufficient; real-time playback speed is not required.
- **FR-011**: The user MUST be able to cancel processing, replace the video, or change the target and emoji before a new processing run. Such changes MUST invalidate stale results and release resources associated with superseded work.
- **FR-012**: Before download, the application MUST allow review of the processed result and identify any lost/occluded intervals by time. It MUST distinguish successful file creation from verified mask coverage.
- **FR-013**: The complete workflow MUST be available through a reusable standard Web Component. A host page MUST be able to configure and control an instance through documented attributes, properties, methods, and DOM events. Multiple instances MUST keep their selected media and processing state independent, and removal of an instance MUST stop its processing and release its media resources.

### Non-Functional Requirements

- **NFR-001 — Privacy**: All media decoding, face detection, tracking, rendering, and export MUST execute on the user's device. Source media, extracted frames, audio, face coordinates, and identifying data derived from media MUST NOT be transmitted to any external service, including logging or analytics services. Remote processing fallback is prohibited.
- **NFR-002 — Responsiveness**: Processing MAY be slower than real time, but progress MUST update at least once per second while work advances, and cancellation MUST be acknowledged within one second on the reference device described under Assumptions.
- **NFR-003 — Usability**: Status and error messages MUST use understandable text and MUST NOT rely solely on color. Users MUST be able to distinguish target selection, acquired tracking, lost tracking, ongoing processing, completed export, and failure.
- **NFR-004 — Local lifecycle**: Imported media and intermediate results MUST remain local to the active session and MUST be released when replaced or when the session closes. Persistent copies are limited to downloads the user explicitly requests.

### Scope Boundaries

**Included**: Local MP4/WebM import, local frame extraction and rendering, initial face detection, explicit selection of one target, manual selection fallback, deterministic tracking, emoji selection and overlay, progress preview, loss reporting, and local export/download.

**Excluded**: Server-side media processing or storage, cloud rendering, generative face swapping, photorealistic face generation, accounts and authentication, sharing links, multi-user collaboration, and live webcam masking. Simultaneous masking of multiple targets is outside this single-target iteration.

### Key Entities *(include if feature involves data)*

- **Source Video**: The session-local recording, including its filename, format, dimensions, orientation, duration, and frame timing.
- **Target Selection**: The one explicitly selected face, its initial boundary and available landmarks, and whether selection came from detection or a manually drawn box.
- **Frame Tracking Result**: A frame's time, target boundary, available landmarks, orientation, and acquired/lost status; connected to the original selection.
- **Mask Settings**: The valid emoji selection and coverage settings applied consistently to preview and export.
- **Processing Session**: The current source, selection, settings, progress, cancellation state, and lost intervals.
- **Export Result**: The completed local video, format, duration, and associated settings and review information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete import, explicit selection, processing, review, and download for each supported MP4 and WebM fixture without a server upload or account. Each downloaded file opens successfully in an independent compatible player.
- **SC-002**: In every annotated test clip where the target remains visible and trackable, inspection of every output frame confirms full coverage of the target face boundary, with zero identity switches. The corpus includes multiple initial faces, translation, size changes, head tilt, and crossing paths.
- **SC-003**: Three runs of each deterministic tracking fixture, using the same input, initial target, settings, application version, and device/browser environment, produce identical target assignments, coordinates, and statuses at every frame. Encoded file bytes need not be identical.
- **SC-004**: Network inspection across import, detection, tracking, preview, and export observes zero transmissions of source media or media-derived identifying data. Once application resources are available, the entire workflow completes with network access disabled.
- **SC-005**: Exported video retains the source's displayed orientation, dimensions, and frame presentation order, and its duration differs from the source by no more than one source-frame interval or 100 milliseconds, whichever is greater.
- **SC-006**: On the reference device, a 60-second 1280-by-720, 30-frame-per-second test clip processes with progress updates at least once per second while work advances; cancellation is acknowledged within one second and the browser does not display an unresponsive-page prompt.
- **SC-007**: Every no-face, invalid-file, cancellation, and loss/re-entry fixture produces its specified recovery behavior. Every known loss interval is identified in review, and no ambiguous reacquisition silently switches the target.
- **SC-008**: For every supported preset and custom-emoji fixture, preview and export show the selected emoji and the coverage required by FR-005; invalid emoji input retains the previous valid selection and gives feedback.
- **SC-009**: A plain HTML page can import the distributed component and complete SC-001 without a UI framework. A page with two instances can load different videos and change or cancel one without affecting the other. Removing an active instance stops its work and releases its resources; reinserting it starts a fresh session. Configuration and events behave according to the published component contract.

## Assumptions

- This iteration masks one explicitly selected face per recording. Other faces remain unchanged unless covered incidentally by the target's mask.
- The user's out-of-scope list is treated as a confirmed exclusion list; its clarification label does not indicate an unanswered requirement.
- Determinism means repeatable tracking within a fixed application and device/browser environment. Bit-for-bit reproducibility across different devices, environments, or encoders is not required.
- Automatic tracking cannot guarantee identity recovery through every full occlusion. Loss reporting and review are required; last-known coordinates alone are not evidence that the face remains covered.
- Rotation matching means visible in-plane head tilt. Photorealistic reconstruction and three-dimensional emoji rendering are not required.
- A custom emoji means a single supported emoji character or joined emoji sequence, not an uploaded image or a generatively created face. An opaque backing is permitted to meet full face-coverage requirements.
- At least one downloadable video format is required; matching the source container or exporting MP4 specifically is not required. Actual supported codec combinations and browser compatibility will be established during implementation planning and presented in the application.
- Original audio is preserved when present. Audio anonymization is outside this face-masking feature; the interface identifies that audio remains unchanged. If preservation is unsupported, the application reports the limitation rather than silently dropping audio.
- Application resources may be delivered over the network before processing. Once loaded, the complete video workflow must work without network access. Offline installation and offline reload are not required by this iteration.
- Initial performance acceptance uses a desktop or laptop with at least four CPU cores and 8 GB of memory and a supported browser. Planning will record an exact reference machine, browser, codecs, and representative fixtures before performance validation. The 60-second clip is a baseline for validation, not a maximum import duration.
- Validation uses locally held, annotated recordings that identify intended face boundaries and known occlusion intervals. Detection and coverage claims apply to that documented corpus, not to every possible real-world recording.
- The repository constitution currently contains unfilled template placeholders, so it supplies no ratified project-specific principles. The standard Web Component delivery constraint is explicitly supplied by the user; other architecture choices belong to the implementation plan.
