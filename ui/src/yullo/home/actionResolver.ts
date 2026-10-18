export type ActionKind = 
  | 'review_knowledge' 
  | 'retry_source' 
  | 'add_action' 
  | 'review_publication' 
  | 'open_space'
  | 'add_sources'
  | 'continue_setup'
  | 'add_service'
  | 'add_booking_action'
  | 'add_location'
  | 'customize_appearance'
  | 'view_conversation_pattern'
  | 'open_entity'
  | 'view_opportunity';

export function resolveHomeAction(
  kind: ActionKind,
  spaceId: string,
  targetId?: string
): string | null {
  // Opening a Space is a public link; manage/retry/review links go to authenticated Yullo views.
  
  switch (kind) {
    case 'open_space':
      // Requires Space UUID and server-provided real slug, but we only have ID here usually.
      // Assuming route is /space/:id
      return `/space/${spaceId}`;
      
    case 'review_knowledge':
    case 'add_sources':
    case 'continue_setup':
      return `/manage/${spaceId}/knowledge`;
      
    case 'retry_source':
      if (!targetId) return null;
      // We implement retry as an explicit authenticated POST, but the UI might need a route to trigger it,
      // or we just link to the source management page and let them do it there.
      return `/manage/${spaceId}/sources/${targetId}`;
      
    case 'add_action':
    case 'add_booking_action':
      return `/manage/${spaceId}/actions/new`;
      
    case 'add_service':
    case 'add_location':
      return `/manage/${spaceId}/entities/new`;
      
    case 'customize_appearance':
      return `/manage/${spaceId}/appearance`;
      
    case 'review_publication':
      return `/manage/${spaceId}/publish`;
      
    case 'view_conversation_pattern':
      return `/manage/${spaceId}/conversations?intent=${targetId || 'pattern'}`;
      
    case 'open_entity':
      if (!targetId) return null;
      return `/manage/${spaceId}/entities/${targetId}`;
      
    case 'view_opportunity':
      // Not yet implemented integration
      return null;
      
    default:
      return null;
  }
}
