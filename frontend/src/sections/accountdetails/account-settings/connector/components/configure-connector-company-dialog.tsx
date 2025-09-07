import { useRef, useState } from 'react';
import closeIcon from '@iconify-icons/eva/close-outline';

import {
  Box,
  alpha,
  Dialog,
  Button,
  useTheme,
  IconButton,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';

import { Iconify } from 'src/components/iconify';

import { ConnectorId } from 'src/sections/accountdetails/types/connector';
import GoogleWorkSpaceConfigForm from './google-workspace-config-company-form';
import type { GoogleWorkspaceConfigFormRef } from './google-workspace-config-company-form';
import AtlassianConfigForm, { AtlassianConfigFormRef } from './atlassian-config-form';
import OneDriveConfigForm, { OneDriveConfigFormRef } from './onedrive-form';
import SharePointConfigForm, { SharePointConfigFormRef } from './sharepoint-form';

// Method configurations
interface ConnectorConfigType {
  [key: string]: {
    src: string;
    title: string;
    color: string;
  };
}

const CONNECTOR_CONFIG: ConnectorConfigType = {
  googleWorkspace: {
    src: '/assets/icons/connectors/google.svg',
    title: 'Google Workspace',
    color: '#4285F4',
  },
  atlassian: {
    src: '/assets/icons/connectors/atlassian.svg',
    title: 'Atlassian',
    color: '#0052CC',
  },
  onedrive: {
    src: '/assets/icons/connectors/onedrive.svg',
    title: 'OneDrive',
    color: '#0078D4',
  },
  sharepointOnline: {
    src: '/assets/icons/connectors/sharepoint.svg',
    title: 'SharePoint Online',
    color: '#0078D4',
  },
};

interface ConfigureConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  onFileRemoved: (connectorId: string) => void;
  connectorType: string | null;
  isEnabled: boolean | null;
}

// Create a type for any form ref that has a handleSave method
type AnyFormRef = {
  handleSave: () => Promise<any>;
};

const ConfigureConnectorDialog = ({
  open,
  onClose,
  onSave,
  onFileRemoved,
  connectorType,
  isEnabled,
}: ConfigureConnectorDialogProps) => {
  const theme = useTheme();
  const [isValid, setIsValid] = useState(false);

  const googleWorkspaceFormRef = useRef<GoogleWorkspaceConfigFormRef>(null);
  const atlassianFormRef = useRef<AtlassianConfigFormRef>(null);
  const onedriveFormRef = useRef<OneDriveConfigFormRef>(null);
  const sharepointFormRef = useRef<SharePointConfigFormRef>(null);
  // Get connector config if available
  const connectorConfig = connectorType ? CONNECTOR_CONFIG[connectorType] : null;

  // Form validation state
  const handleValidationChange = (valid: boolean) => {
    setIsValid(valid);
  };

  // Handle save button click - triggers the form's save method based on the active connector type
  const handleSaveClick = async () => {
    let currentRef: React.RefObject<AnyFormRef> | null = null;

    // Determine which form ref to use based on connector type
    switch (connectorType) {
      case ConnectorId.GOOGLE_WORKSPACE:
        currentRef = googleWorkspaceFormRef;
        break;
      case ConnectorId.ATLASSIAN:
        currentRef = atlassianFormRef;
        break;
      case ConnectorId.ONEDRIVE:
        currentRef = onedriveFormRef;
        break;
      case ConnectorId.SHAREPOINT_ONLINE:
        currentRef = sharepointFormRef;
        break;
      default:
        currentRef = null;
    }

    // If we have a valid ref with handleSave method
    if (currentRef?.current?.handleSave) {
      const result = await currentRef.current.handleSave();
      // Don't call onSave if the result is explicitly false
      if (result !== false) {
        onSave();
      }
    }
  };

  // Handle successful save in forms
  const handleFormSaveSuccess = () => {
    onSave();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1,
          boxShadow: '0 10px 35px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        },
      }}
    >
      {connectorConfig && (
        <>
          <DialogTitle
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2.5,
              pl: 3,
              color: theme.palette.text.primary,
              borderBottom: '1px solid',
              borderColor: theme.palette.divider,
              fontWeight: 500,
              fontSize: '1rem',
              m: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '6px',
                  bgcolor: alpha(connectorConfig.color, 0.1),
                  color: connectorConfig.color,
                }}
              >
                <img src={connectorConfig.src} alt={connectorConfig.title} width={18} height={18} />
              </Box>
              Configure {connectorConfig.title} Integration
            </Box>

            <IconButton
              onClick={onClose}
              size="small"
              sx={{ color: theme.palette.text.secondary }}
              aria-label="close"
            >
              <Iconify icon={closeIcon} width={20} height={20} />
            </IconButton>
          </DialogTitle>

          <DialogContent
            sx={{
              p: 0,
              '&.MuiDialogContent-root': {
                pt: 3,
                px: 3,
                pb: 0,
              },
            }}
          >
            <Box>
              {connectorType === ConnectorId.GOOGLE_WORKSPACE && (
                <GoogleWorkSpaceConfigForm
                  onValidationChange={handleValidationChange}
                  onSaveSuccess={handleFormSaveSuccess}
                  onFileRemoved={() => onFileRemoved('googleWorkspace')} //
                  ref={googleWorkspaceFormRef}
                  isEnabled={isEnabled || false}
                />
              )}
              {connectorType === ConnectorId.ATLASSIAN && (
                <AtlassianConfigForm
                  onValidationChange={handleValidationChange}
                  onSaveSuccess={handleFormSaveSuccess}
                  ref={atlassianFormRef}
                  isEnabled={isEnabled || false}
                />
              )}
              {connectorType === ConnectorId.ONEDRIVE && (
                <OneDriveConfigForm
                  onValidationChange={handleValidationChange}
                  onSaveSuccess={handleFormSaveSuccess}
                  ref={onedriveFormRef}
                  isEnabled={isEnabled || false}
                />
              )}
              {connectorType === ConnectorId.SHAREPOINT_ONLINE && (
                <SharePointConfigForm
                  onValidationChange={handleValidationChange}
                  onSaveSuccess={handleFormSaveSuccess}
                  ref={sharepointFormRef}
                  isEnabled={isEnabled || false}
                />
              )}
            </Box>
          </DialogContent>

          <DialogActions
            sx={{
              p: 2.5,
              borderTop: '1px solid',
              borderColor: theme.palette.divider,
              bgcolor: alpha(theme.palette.background.default, 0.5),
            }}
          >
            <Button
              variant="text"
              onClick={onClose}
              sx={{
                color: theme.palette.text.secondary,
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.divider, 0.8),
                },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveClick}
              disabled={!isValid}
              sx={{
                bgcolor: theme.palette.primary.main,
                boxShadow: 'none',
                fontWeight: 500,
                '&:hover': {
                  bgcolor: theme.palette.primary.dark,
                  boxShadow: 'none',
                },
                px: 3,
              }}
            >
              Save
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default ConfigureConnectorDialog;
