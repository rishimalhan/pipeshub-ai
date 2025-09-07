// services/api.ts
import axios from 'src/utils/axios';

import { CONFIG } from 'src/config-global';
import { UnifiedPermission } from 'src/components/permissions/UnifiedPermissionsDialog';

import type {
  Item,
  KBPermission,
  KnowledgeBase,
  FolderContents,
  CreatePermissionRequest,
  UpdatePermissionRequest,
  RemovePermissionRequest,
} from '../types/kb';

const API_BASE = '/api/v1/knowledgeBase';

export class KnowledgeBaseAPI {
  // Knowledge Base operations
  static async getKnowledgeBases(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<any> {
    const response = await axios.get(`${API_BASE}/`, { params });
    if (!response.data) throw new Error('Failed to fetch knowledge bases');

    // Check if the API returns paginated data or simple array
    if (response.data.knowledgeBases && response.data.pagination) {
      // Paginated response
      return {
        knowledgeBases: response.data.knowledgeBases,
        pagination: response.data.pagination,
      };
    } if (Array.isArray(response.data)) {
      // Simple array response (fallback)
      return response.data;
    } 
      // Handle other response formats
      return response.data;
    
  }

  static async createKnowledgeBase(name: string): Promise<KnowledgeBase> {
    const response = await axios.post(`${API_BASE}/`, { kbName: name });
    if (!response.data) throw new Error('Failed to create knowledge base');
    return response.data;
  }

  static async getKnowledgeBase(kbId: string): Promise<KnowledgeBase> {
    const response = await axios.get(`${API_BASE}/${kbId}`);
    if (!response.data) throw new Error('Failed to fetch knowledge base');
    return response.data;
  }

  static async updateKnowledgeBase(kbId: string, name: string): Promise<KnowledgeBase> {
    const response = await axios.put(`${API_BASE}/${kbId}`, { kbName: name });
    if (!response.data) throw new Error('Failed to update knowledge base');
    return response.data;
  }

  static async deleteKnowledgeBase(kbId: string): Promise<void> {
    const response = await axios.delete(`${API_BASE}/${kbId}`);
    if (response.status !== 200) throw new Error('Failed to delete knowledge base');
  }

  // Folder operations
  static async createFolder(kbId: string, folderId: string | null, name: string): Promise<Item> {
    const url = folderId
      ? `${API_BASE}/${kbId}/folder/${folderId}/subfolder`
      : `${API_BASE}/${kbId}/folder`;

    const response = await axios.post(url, { folderName: name });
    if (!response.data) throw new Error('Failed to create folder');
    return response.data;
  }

  static async updateFolder(kbId: string, folderId: string, name: string): Promise<void> {
    const response = await axios.put(`${API_BASE}/${kbId}/folder/${folderId}`, {
      folderName: name,
    });
    if (response.status !== 200) throw new Error('Failed to update folder');
  }

  static async deleteFolder(kbId: string, folderId: string): Promise<void> {
    const response = await axios.delete(`${API_BASE}/${kbId}/folder/${folderId}`);
    if (response.status !== 200) throw new Error('Failed to delete folder');
  }

  // Content operations
  static async getFolderContents(
    kbId: string,
    folderId?: string,
    params?: any
  ): Promise<FolderContents> {
    const url = folderId ? `${API_BASE}/${kbId}/folder/${folderId}` : `${API_BASE}/${kbId}/records`;
    const debugUrl_ALlRecords = `${API_BASE}/records`;
    const response = await axios.get(url, { params });
    if (!response.data) throw new Error('Failed to fetch folder contents');
    return response.data;
  }

  // Record operations
  static async deleteRecords(kbId: string, recordIds: string[], folderId?: string): Promise<void> {
    const url = folderId
      ? `${API_BASE}/${kbId}/folder/${folderId}/records`
      : `${API_BASE}/${kbId}/records`;

    const response = await axios.delete(url, {
      data: { recordIds },
    });
    if (response.status !== 200) throw new Error('Failed to delete records');
  }

  static async updateRecord(
    kbId: string,
    recordId: string,
    data: any,
    folderId?: string
  ): Promise<any> {
    const url = folderId
      ? `${API_BASE}/${kbId}/folder/${folderId}/record/${recordId}`
      : `${API_BASE}/${kbId}/record/${recordId}`;

    const response = await axios.put(url, data);
    if (!response.data) throw new Error('Failed to update record');
    return response.data;
  }

  // Upload operations
  static async uploadFiles(
    kbId: string,
    folderId: string | undefined,
    formData: FormData
  ): Promise<any> {
    const url = folderId
      ? `${API_BASE}/${kbId}/folder/${folderId}/upload`
      : `${API_BASE}/${kbId}/upload`;

    const response = await axios.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    if (!response.data) throw new Error('Failed to upload files');
    return response.data;
  }

  // Permission operations

  /**
   * Create permissions for multiple users on a knowledge base
   */
  static async createKBPermissions(kbId: string, data: CreatePermissionRequest): Promise<any> {
    const response = await axios.post(`${API_BASE}/${kbId}/permissions`, data);
    if (!response.data) throw new Error('Failed to create permissions');
    return response.data;
  }

  /**
   * List all permissions for a knowledge base
   */
  static async listKBPermissions(kbId: string): Promise<UnifiedPermission[]> {
    const response = await axios.get(`${API_BASE}/${kbId}/permissions`);
    if (!response.data.permissions) throw new Error('Failed to fetch permissions');
    return response.data.permissions;
  }

  /**
   * Update a single user's permission on a knowledge base
   */
  static async updateKBPermission(
    kbId: string,
    data: UpdatePermissionRequest
  ): Promise<any> {
    const response = await axios.put(`${API_BASE}/${kbId}/permissions`, data);
    if (!response.data) throw new Error('Failed to update permission');
    return response.data;
  }

  /**
   * Remove a user's permission from a knowledge base
   */
  static async removeKBPermission(kbId: string, data: RemovePermissionRequest): Promise<any> {
    const response = await axios.delete(`${API_BASE}/${kbId}/permissions`, { data });
    if (!response.data) throw new Error('Failed to remove permission');
    return response.data;
  }

  // Statistics and analytics
  static async getConnectorStats(): Promise<any> {
    const response = await axios.get(`${API_BASE}/stats/connector`);
    if (!response.data) throw new Error('Failed to fetch connector stats');
    return response.data;
  }

  // Reindexing operations
  static async reindexRecord(recordId: string): Promise<any> {
    const response = await axios.post(`${API_BASE}/reindex/record/${recordId}`);
    if (response.status!==200) throw new Error('Failed to reindex record');
    return response.data;
  }

  static async reindexAllRecords(connectorName: string): Promise<any> {
    const response = await axios.post(`${API_BASE}/reindex-all/connector`, {
      app: connectorName,
    });
    if (!response.data) throw new Error('Failed to reindex all records');
    return response.data;
  }

  static async resyncConnectorRecords(connectorName: string): Promise<any> {
    const response = await axios.post(`${API_BASE}/resync/connector`, {
      connectorName,
    });
    if (!response.data) throw new Error('Failed to resync connector records');
    return response.data;
  }

  // Record streaming
  static async getRecordBuffer(recordId: string): Promise<Blob> {
    const response = await axios.get(`${API_BASE}/stream/record/${recordId}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Record operations
  static async getRecordById(recordId: string): Promise<any> {
    const response = await axios.get(`${API_BASE}/record/${recordId}`);
    if (!response.data) throw new Error('Failed to fetch record');
    return response.data;
  }

  static async updateRecordDirect(recordId: string, data: any): Promise<any> {
    const response = await axios.put(`${API_BASE}/record/${recordId}`, data);
    if (!response.data) throw new Error('Failed to update record');
    return response.data;
  }

  static async deleteRecord(recordId: string): Promise<any> {
    const response = await axios.delete(`${API_BASE}/record/${recordId}`);
    if (!response.data) throw new Error('Failed to delete record');
    return response.data;
  }

  static async archiveRecord(recordId: string): Promise<any> {
    const response = await axios.patch(`${API_BASE}/record/${recordId}/archive`);
    if (!response.data) throw new Error('Failed to archive record');
    return response.data;
  }

  static async unarchiveRecord(recordId: string): Promise<any> {
    const response = await axios.patch(`${API_BASE}/record/${recordId}/unarchive`);
    if (!response.data) throw new Error('Failed to unarchive record');
    return response.data;
  }

  // Create records
  static async createRecordsInKB(kbId: string, data: any): Promise<any> {
    const response = await axios.post(`${API_BASE}/${kbId}/records`, data);
    if (!response.data) throw new Error('Failed to create records in KB');
    return response.data;
  }

  static async createRecordsInFolder(kbId: string, folderId: string, data: any): Promise<any> {
    const response = await axios.post(`${API_BASE}/${kbId}/folder/${folderId}/records`, data);
    if (!response.data) throw new Error('Failed to create records in folder');
    return response.data;
  }

  // Get all records across knowledge bases
  static async getAllRecords(params?: any): Promise<any> {
    const response = await axios.get(`${API_BASE}/records`, { params });
    if (!response.data) throw new Error('Failed to fetch all records');
    return response.data;
  }

  static async handleDownloadDocument(externalRecordId: string, fileName: string): Promise<void> {
    try {
      const response = await axios.get(
        `${CONFIG.backendUrl}/api/v1/document/${externalRecordId}/download`,
        { responseType: 'blob' } // Set response type to blob to handle binary data
      );
      // Read the blob response as text to check if it's JSON with signedUrl
      const reader = new FileReader();
      const textPromise = new Promise<string>((resolve) => {
        reader.onload = () => {
          resolve(reader.result?.toString() || '');
        };
      });

      reader.readAsText(response.data);
      const text = await textPromise;

      let downloadUrl;
      // Use the provided fileName instead of extracting it from headers or URL
      // Get filename from Content-Disposition header if available
      let filename;
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      if (!filename) {
        filename = fileName || `document-${externalRecordId}`;
      }

      // Try to parse as JSON to check for signedUrl property
      try {
        const jsonData = JSON.parse(text);
        if (jsonData && jsonData.signedUrl) {
          // Create a hidden link with download attribute
          const downloadLink = document.createElement('a');
          downloadLink.href = jsonData.signedUrl;
          downloadLink.setAttribute('download', filename); // Use provided filename
          downloadLink.setAttribute('target', '_blank');
          downloadLink.style.display = 'none';

          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
      } catch (e) {
        // Case 2: Response is binary data
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const blob = new Blob([response.data], { type: contentType });
        downloadUrl = URL.createObjectURL(blob);

        // Create a temporary anchor element for download of binary data
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', filename); // Use provided filename

        // Append to the document, trigger click, and then remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL we created
        URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      throw new Error('Failed to download document');
    }
  }
}
