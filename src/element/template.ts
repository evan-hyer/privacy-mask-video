import styles from './styles.css?inline';
export function template(): string {
  return `<style>${styles}</style><main part="container">
  <h2>Mask a face in your video</h2><p>Select one face, cover it with an emoji, and save a new video.</p>
  <small>Processing runs on this device. Audio is preserved and remains unchanged.</small>
  <label class="drop" part="drop-zone">Choose or drop a local MP4 or WebM<input id="file" type="file" accept="video/mp4,video/webm,.mp4,.webm"></label>
  <div class="status" id="status" part="status">Initializing local processing…</div><p id="announce" class="sr-only" role="status" aria-live="polite" aria-atomic="true">Initializing local processing…</p>
  <div class="preview" part="preview"><canvas id="preview" width="640" height="360" aria-label="Video preview. Choose a face below or draw a rectangle."></canvas></div>
  <div class="faces" id="faces" part="face-list" role="group" aria-label="Detected faces"></div>
  <fieldset id="manual"><legend>Manual selection</legend><p>Drag across the picture or enter a rectangle in video pixels.</p>
  <div class="row"><label>X<input id="x" type="number" min="0" value="0" step="any"></label><label>Y<input id="y" type="number" min="0" value="0" step="any"></label><label>Width<input id="width" type="number" min="1" value="100" step="any"></label><label>Height<input id="height" type="number" min="1" value="100" step="any"></label><button id="region" type="button">Select rectangle</button></div></fieldset>
  <div class="row"><label>Emoji<select id="emoji" aria-label="Preset emoji"></select></label><label>Custom emoji<input id="custom" type="text" placeholder="😎" aria-label="Supported custom emoji"></label><button id="apply" type="button">Apply emoji</button></div>
  <div class="row" part="controls"><button id="process" type="button" class="primary">Process video</button><button id="cancel" type="button">Cancel</button><button id="reset" type="button">Reset</button><button id="initialize" type="button" hidden>Retry initialization</button></div>
  <progress id="progress" part="progress" max="1" value="0" aria-label="Video processing progress" hidden></progress>
  <section id="review-section" hidden><h3>Review your video</h3><p>File creation does not verify face coverage. Review the full video before sharing. Audio remains unchanged.</p><video id="review" part="review" controls playsinline preload="metadata" aria-label="Processed video review"></video><p id="loss-summary"></p><ul id="losses" class="losses"></ul><button id="download" type="button" class="primary" part="download-button">Download masked video</button></section>
  <small>Limits: 256 MiB, 10 minutes, up to 1920 pixels per side and 2,073,600 pixels.</small>
  </main>`;
}
