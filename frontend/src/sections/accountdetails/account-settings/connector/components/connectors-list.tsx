import type React from 'react';
import type { Icon as IconifyIcon } from '@iconify/react';

import googleIcon from '@iconify-icons/mdi/google';
import atlassianIcon from '@iconify-icons/eva/globe-2-outline';
import settingsIcon from '@iconify-icons/eva/settings-2-outline';

export interface ConnectorConfig {
  id: string;
  icon?: React.ComponentProps<typeof IconifyIcon>['icon'];
  src?:string
  title: string;
  description: string;
  color: string;
}
export interface ConfigStatus {
  googleWorkspace: boolean;
  atlassian: boolean;
  microsoftWorkspace: boolean;
}
export const GOOGLE_WORKSPACE_SCOPE = [
  'email openid',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
].join(' ');

// Define available connectors
export const CONNECTORS_LIST: ConnectorConfig[] = [
  {
    id: 'googleWorkspace',
    icon: googleIcon,
    src: '/assets/icons/connectors/google.svg',
    title: 'Google Workspace',
    description:
      'Integrate with Google Workspace for calendar, gmail, spreadsheets, drive and document sharing',
    color: '#4285F4',
  },
  {
    id: 'atlassian',
    icon: atlassianIcon,
    src: '/assets/icons/connectors/atlassian.svg',
    title: 'Atlassian',
    description: 'Integrate with Atlassian for Confluence and Jira',
    color: '#0052CC',
  },
  {
    id: 'microsoftWorkspace',
    icon: settingsIcon,
    src: '/assets/icons/connectors/microsoft.svg',
    title: 'Microsoft 365',
    description: 'Integrate with Microsoft 365 for OneDrive, Outlook, SharePoint, and Teams',
    color: '#0078D4',
  },
];