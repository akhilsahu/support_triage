import { yulloApiClient } from './client';

export interface VectorChunkImage {
  url: string;
  alt: string;
  title?: string;
  destination_url?: string;
}

export interface VectorChunkLink {
  title: string;
  url: string;
}

export interface VectorChunkItem {
  id: string;
  chunk_index: number;
  page: number;
  section: string;
  doc_id: string;
  source_id?: string;
  source_title?: string;
  text: string;
  source_text?: string;
  images: VectorChunkImage[];
  links: VectorChunkLink[];
  metadata: Record<string, any>;
  is_table: boolean;
  is_table_row: boolean;
  row_label?: string;
  token_estimate: number;
}

export interface VectorSourceSummary {
  source_id: string;
  title: string;
  indexed_doc_id?: string;
  target_url?: string;
  chunk_count: number;
  images_count: number;
  created_at?: string;
  ingestion_status?: string | null;
  is_confirmed?: boolean;
  indexing_status?: string | null;
}

export interface VectorChunksResponse {
  sources: VectorSourceSummary[];
  selected_source_id?: string;
  total_chunks: number;
  filtered_chunks_count: number;
  chunks: VectorChunkItem[];
  source_images: Array<Record<string, any>>;
}

export const chunksApi = {
  getSpaceVectorChunks: async (
    spaceId: string,
    sourceId?: string,
    limit: number = 600
  ): Promise<VectorChunksResponse> => {
    const params: Record<string, any> = { limit };
    if (sourceId && sourceId !== 'all') {
      params.source_id = sourceId;
    }

    const res = await yulloApiClient.get<VectorChunksResponse>(
      `/spaces/${spaceId}/vector-chunks`,
      { params }
    );
    return res.data;
  },
};
