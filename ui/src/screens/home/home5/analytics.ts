export type LandingEvent =
  | 'landing_view'
  | 'signup_cta_clicked'
  | 'demo_started'
  | 'demo_completed'
  | 'pricing_viewed'
  | 'signup_started'
  | 'signup_completed'
export type LandingDetails = { placement?: string; scenario?: string }

/** Integration boundary only: no production collector is configured yet.
 * A first-party collector may subscribe to this event. Never include form data.
 */
export function trackLanding(
  event: LandingEvent,
  details: LandingDetails = {}
) {
  window.dispatchEvent(
    new CustomEvent('support247:landing', {
      detail: { event, variant: 'homepage5', ...details },
    })
  )
}
