import { yulloApiClient } from './client'

export interface PublicSpaceIcon {
  id: string
  name: string
  handle: string
  icon_url: string | null
  url: string
}

export interface PublicSpaceDirectory {
  items: PublicSpaceIcon[]
  next_cursor: string | null
}

export async function browsePublicSpaces(q: string, cursor: string | null, signal?: AbortSignal) {
  const { data } = await yulloApiClient.get<PublicSpaceDirectory>('/public/directory', {
    params: { q, cursor: cursor || undefined }, signal,
  })
  return data
}
