import { PrivacyMaskVideoElement } from './element/privacy-mask-video';
export { PrivacyMaskVideoElement };
export { PrivacyMaskError, PrivacyMaskConfigurationError } from './core/errors';
export type { ErrorCode } from './core/errors';
export type { CapabilityReport, ComponentState, ExportResult, FaceSummary, LossInterval, LossReason, Point, Progress, Rect, SourceSummary } from './core/types';
export function definePrivacyMaskVideo(): void {
  const existing = customElements.get('privacy-mask-video');
  if (existing === PrivacyMaskVideoElement) return;
  if (existing) throw new DOMException('privacy-mask-video is already registered with a different constructor.','NotSupportedError');
  customElements.define('privacy-mask-video',PrivacyMaskVideoElement);
}
declare global { interface HTMLElementTagNameMap { 'privacy-mask-video': PrivacyMaskVideoElement } }
