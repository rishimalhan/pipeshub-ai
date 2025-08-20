import { z } from 'zod';
import eyeIcon from '@iconify-icons/eva/eye-fill';
import infoIcon from '@iconify-icons/eva/info-outline';
import hashIcon from '@iconify-icons/eva/hash-outline';
import lockIcon from '@iconify-icons/eva/lock-outline';
import eyeOffIcon from '@iconify-icons/eva/eye-off-fill';
import uploadIcon from '@iconify-icons/eva/upload-outline';
import editOutlineIcon from '@iconify-icons/eva/edit-outline';
import saveOutlineIcon from '@iconify-icons/eva/save-outline';
import fileTextIcon from '@iconify-icons/mdi/file-text-outline';
import closeOutlineIcon from '@iconify-icons/eva/close-outline';
import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';

import { alpha, useTheme } from '@mui/material/styles';
import {
  Box,
  Grid,
  Alert,
  Paper,
  Stack,
  Button,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { Iconify } from 'src/components/iconify';

// import { getConnectorPublicUrl } from '../../services/utils/services-configuration-service';

interface MicrosoftWorkspaceConfigFormProps {
  onValidationChange: (isValid: boolean) => void;
  onSaveSuccess?: () => void;
  isEnabled?: boolean;
}

export interface MicrosoftWorkspaceConfigFormRef {
  handleSave: () => Promise<boolean>;
}

const getRedirectUris = async () => {
  // Get the current window URL without hash and search parameters
  const currentUrl = new URL(window.location.href);
  currentUrl.hash = '';
  currentUrl.search = '';
  const currentWindowLocation = currentUrl.toString();

  // Get the frontend URL from the backend
  try {
    const response = await axios.get(`/api/v1/configurationManager/frontendPublicUrl`);
    const frontendBaseUrl = response.data.url;
    // Ensure the URL ends with a slash if needed
    const frontendUrl = frontendBaseUrl.endsWith('/')
      ? `${frontendBaseUrl}account/individual/settings/connector/microsoftWorkspace`
      : `${frontendBaseUrl}/account/individual/settings/connector/microsoftWorkspace`;

    return {
      currentWindowLocation,
      recommendedRedirectUri: frontendUrl,
      urisMismatch: currentWindowLocation !== frontendUrl,
    };
  } catch (error) {
    console.error('Error fetching frontend URL:', error);
    return {
      currentWindowLocation,
      recommendedRedirectUri: currentWindowLocation,
      urisMismatch: false,
    };
  }
};

// Define Zod schema for form validation
const microsoftWorkspaceConfigSchema = z.object({
  clientId: z.string().min(1, { message: 'Client ID is required' }),
  clientSecret: z.string().min(1, { message: 'Client Secret is required' }),
  tenantId: z.string().min(1, { message: 'Tenant ID is required' }),
  redirectUri: z.string().url({ message: 'Please enter a valid URL' }),
});

type MicrosoftWorkspaceConfigFormData = z.infer<typeof microsoftWorkspaceConfigSchema>;

const MicrosoftWorkspaceConfigForm = forwardRef<
  MicrosoftWorkspaceConfigFormRef,
  MicrosoftWorkspaceConfigFormProps
>(({ onValidationChange, onSaveSuccess, isEnabled }, ref) => {
  const theme = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<MicrosoftWorkspaceConfigFormData>({
    clientId: '',
    clientSecret: '',
    tenantId: '',
    redirectUri: '', // Will be set after fetching
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [redirectUriInfo, setRedirectUriInfo] = useState<{
    currentWindowLocation: string;
    recommendedRedirectUri: string;
    urisMismatch: boolean;
  } | null>(null);

  // Expose handleSave method to parent component
  useImperativeHandle(ref, () => ({
    handleSave: async () => handleSave(),
  }));

  // Load existing configuration
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const response = await axios.get('/api/v1/connectors/config', {
          params: { service: 'microsoftWorkspace' },
        });

        if (response.data && Object.keys(response.data).length > 0) {
          setFormData({
            clientId: response.data.clientId || '',
            clientSecret: response.data.clientSecret || '',
            tenantId: response.data.tenantId || '',
            redirectUri: response.data.redirectUri || '',
          });
        }
      } catch (error) {
        console.error('Error loading configuration:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadRedirectUriInfo = async () => {
      const uriInfo = await getRedirectUris();
      setRedirectUriInfo(uriInfo);
      // Always initialize redirectUri with recommended value; server config will override if present
      setFormData(prev => ({ ...prev, redirectUri: uriInfo.recommendedRedirectUri }));
    };

    loadConfiguration();
    loadRedirectUriInfo();
  }, []);

  // Validate form whenever formData changes
  useEffect(() => {
    const validateForm = () => {
      try {
        microsoftWorkspaceConfigSchema.parse(formData);
        setErrors({});
        onValidationChange(true);
      } catch (error: any) {
        const newErrors: Record<string, string> = {};
        if (error.errors) {
          error.errors.forEach((err: any) => {
            newErrors[err.path[0]] = err.message;
          });
        }
        setErrors(newErrors);
        onValidationChange(false);
      }
    };

    validateForm();
  }, [formData, onValidationChange]);

  const handleInputChange = (field: keyof MicrosoftWorkspaceConfigFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      setUploadedFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          
          // Extract Microsoft 365 specific fields
          const extractedData = {
            clientId: jsonData.clientId || jsonData.client_id || jsonData.clientId || '',
            clientSecret: jsonData.clientSecret || jsonData.client_secret || jsonData.clientSecret || '',
            tenantId: jsonData.tenantId || jsonData.tenant_id || jsonData.tenantId || '',
            redirectUri: jsonData.redirectUri || jsonData.redirect_uri || jsonData.redirectUri || formData.redirectUri,
          };

          setFormData(prev => ({ ...prev, ...extractedData }));
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          setErrors({ general: 'Invalid JSON file format' });
        }
      };
      reader.readAsText(file);
    } else {
      setErrors({ general: 'Please select a valid JSON file' });
    }
  };

  const handleSave = async (): Promise<boolean> => {
    try {
      setIsSaving(true);
      setErrors({});

      // Validate form before saving
      microsoftWorkspaceConfigSchema.parse(formData);

      // Save configuration
      await axios.post('/api/v1/connectors/config', formData, {
        params: { service: 'microsoftWorkspace' },
      });

      setIsEditing(false);
      onSaveSuccess?.();
      return true;
    } catch (error: any) {
      console.error('Error saving configuration:', error);
      if (error.response?.data?.message) {
        setErrors({ general: error.response.data.message });
      } else {
        setErrors({ general: 'Failed to save configuration. Please try again.' });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const clearUploadedFile = () => {
    setUploadedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* JSON Upload Section */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          bgcolor: alpha(theme.palette.primary.main, 0.02),
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
          Quick Setup - JSON Upload
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload your Microsoft Azure App registration JSON file to quickly configure the connector.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <Button
            variant="outlined"
            startIcon={<Iconify icon={uploadIcon} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={isEditing}
          >
            Choose JSON File
          </Button>
          {uploadedFileName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Iconify icon={fileTextIcon} color="success.main" />
              <Typography variant="body2" color="success.main">
                {uploadedFileName}
              </Typography>
              <IconButton size="small" onClick={clearUploadedFile}>
                <Iconify icon={closeOutlineIcon} />
              </IconButton>
            </Box>
          )}
        </Box>

        {errors.general && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errors.general}
          </Alert>
        )}
      </Paper>

      {/* Manual Configuration Section */}
      <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6">Manual Configuration</Typography>
          {!isEditing && (
            <Button
              variant="outlined"
              startIcon={<Iconify icon={editOutlineIcon} />}
              onClick={handleEdit}
              disabled={isEnabled}
            >
              Edit Configuration
            </Button>
          )}
        </Box>

        <Grid container spacing={3}>
          {/* Client ID */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Client ID"
              value={formData.clientId}
              onChange={(e) => handleInputChange('clientId', e.target.value)}
              error={!!errors.clientId}
              helperText={errors.clientId}
              disabled={!isEditing}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon={hashIcon} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Client Secret */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Client Secret"
              type={showClientSecret ? 'text' : 'password'}
              value={formData.clientSecret}
              onChange={(e) => handleInputChange('clientSecret', e.target.value)}
              error={!!errors.clientSecret}
              helperText={errors.clientSecret}
              disabled={!isEditing}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon={lockIcon} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      edge="end"
                    >
                      <Iconify icon={showClientSecret ? eyeOffIcon : eyeIcon} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Tenant ID */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Tenant ID"
              value={formData.tenantId}
              onChange={(e) => handleInputChange('tenantId', e.target.value)}
              error={!!errors.tenantId}
              helperText={errors.tenantId}
              disabled={!isEditing}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon={hashIcon} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Redirect URI */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Redirect URI"
              value={formData.redirectUri}
              onChange={(e) => handleInputChange('redirectUri', e.target.value)}
              error={!!errors.redirectUri}
              helperText={errors.redirectUri}
              disabled={!isEditing}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon={infoIcon} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        {/* Redirect URI Info */}
        {redirectUriInfo && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Current URL:</strong> {redirectUriInfo.currentWindowLocation}
            </Typography>
            <Typography variant="body2">
              <strong>Recommended Redirect URI:</strong> {redirectUriInfo.recommendedRedirectUri}
            </Typography>
            {redirectUriInfo.urisMismatch && (
              <Typography variant="body2" color="warning.main">
                <strong>Note:</strong> The current URL does not match the recommended redirect URI.
              </Typography>
            )}
          </Alert>
        )}

        {/* Action Buttons */}
        {isEditing && (
          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              startIcon={isSaving ? <CircularProgress size={16} /> : <Iconify icon={saveOutlineIcon} />}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button variant="outlined" onClick={handleCancel}>
              Cancel
            </Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
});

MicrosoftWorkspaceConfigForm.displayName = 'MicrosoftWorkspaceConfigForm';

export default MicrosoftWorkspaceConfigForm;
