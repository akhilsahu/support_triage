// Reasoning-effort options for the admin model controls.
//
// "Off" ("" = no chain-of-thought) is a distinct stored value from "Inherit"
// (null = fall through to the next level: agent → chatbot → server env config).
// The system-wide defaults are config-driven like the model itself: LLM_MODEL /
// REASONING_EFFORT env vars (AgnoConfig). When the user picks an explicit
// effort it overrides; when they pick "Inherit", the config default applies.
export const REASONING_EFFORTS = [
  { value: '', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const

// Sentinel for the <select> value (never sent to the API).
export const INHERIT = '__inherit__'
