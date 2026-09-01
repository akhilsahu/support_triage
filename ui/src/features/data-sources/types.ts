export interface FleetAgent {
  id: string
  slug: string
  name: string
  active: boolean
  is_builtin: boolean
}

export interface DraftConnection {
  name: string
  base_url: string
  auth_type: string
  auth_header: string
  credential_required: boolean
  default_headers: Record<string, string>
}

export interface DraftTool {
  name: string
  display_name: string
  description: string
  method: 'GET' | 'POST'
  path: string
  input_schema: Record<string, unknown>
  request_template: { query?: Record<string, unknown>; headers?: Record<string, unknown>; body?: unknown }
  record_path: string
  output_mapping: Record<string, string>
}

export interface DataSourceDraft {
  source_type: string
  connection: DraftConnection
  tool: DraftTool
  warnings: string[]
}
