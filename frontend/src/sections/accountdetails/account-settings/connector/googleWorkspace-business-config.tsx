import { useSearchParams } from 'react-router-dom';
import infoIcon from '@iconify-icons/eva/info-outline';
import { useState, useEffect, useCallback } from 'react';
import settingsIcon from '@iconify-icons/eva/settings-2-outline';

import { alpha, useTheme } from '@mui/material/styles';
// MUI Components
import {
  Box,
  Grid,
  Link,
  Alert,
  Paper,
  Switch,
  Tooltip,
  Snackbar,
  Container,
  Typography,
  AlertTitle,
  IconButton,
  CircularProgress,
} from '@mui/material';

import axios from 'src/utils/axios';

import { Iconify } from 'src/components/iconify';

import ConnectorStatistics from './connector-stats';
import { CONNECTORS_LIST } from './components/connectors-list';
import ConfigureConnectorDialog from './components/configure-connector-company-dialog';

import type { ConnectorConfig } from './components/connectors-list';

// Define connector types and interfaces
interface ConnectorStatusMap {
  [connectorId: string]: boolean;
}
export interface ConfigStatus {
  googleWorkspace: boolean;
}

const GoogleWorkspaceBusinessPage = () => {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Connector settings updated successfully');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [currentConnector, setCurrentConnector] = useState<string | null>(null);

  const [checkingConfigs, setCheckingConfigs] = useState(true);
  const [lastConfigured, setLastConfigured] = useState<string | null>(null);
  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatusMap>({});
  const [configuredStatus, setConfiguredStatus] = useState<ConnectorStatusMap>({});
  const connectorNames = ['DRIVE','GMAIL'];

  // Fetch connector config
  const fetchConnectorConfig = useCallback(async (connectorId: string) => {
    try {
      const response = await axios.get(`/api/v1/connectors/credentials`, {
        params: {
          service: connectorId,
        },
      });
      return response.data;
    } catch (err) {
      console.error(`Error fetching ${connectorId} configuration:`, err);
      setErrorMessage(`Failed to fetch ${connectorId} connector configuration.  ${err.message} `);
      return null;
    }
  }, []);
  
  const handleFileRemoved = async (connectorId: string) => {
    // Update the configuredStatus state to show not configured
    setConfiguredStatus((prev) => ({
      ...prev,
      [connectorId]: false,
    }));

    // If the connector was enabled, disable it
    if (connectorStatus[connectorId]) {
      try {
        const response = await axios.post(`/api/v1/connectors/disable`, null, {
          params: {
            service: connectorId,
          },
        });

        setConnectorStatus((prev) => ({
          ...prev,
          [connectorId]: false,
        }));

        // Show success message for disabling
        setSuccessMessage(`${getConnectorTitle(connectorId)} disabled successfully`);
        setSuccess(true);
      } catch (disableError) {
        // Handle error specifically for the disable operation
        console.error(`Failed to disable ${getConnectorTitle(connectorId)}:`, disableError);
        setErrorMessage(`Failed to disable ${getConnectorTitle(connectorId)}. Please try again.`);

        // Revert the configured status change since the operation failed
        setConfiguredStatus((prev) => ({
          ...prev,
          [connectorId]: true, // Reset to previous state
        }));

        return; // Exit early to prevent showing success message
      }
    }

    // Refresh connector statuses to get latest from server
    fetchConnectorStatuses();

    // Show success message for removal
    setSuccessMessage(`${getConnectorTitle(connectorId)} configuration has been removed`);
    setSuccess(true);
  };

  // Check configurations separately
  const checkConnectorConfigurations = useCallback(async () => {
    setCheckingConfigs(true);
    try {
      // Check all configurations in parallel
      const results = await Promise.allSettled([fetchConnectorConfig('googleWorkspace')]);

      // Check if each configuration has required fields
      // Ensure property names match what's returned by the API
      const googleConfigured = results[0].status === 'fulfilled' && results[0].value.isConfigured;

      const newConfigStatus = {
        googleWorkspace: googleConfigured,
      };
      setConfiguredStatus(newConfigStatus);
    } catch (err) {
      console.error('Error checking connector configurations:', err);
      setErrorMessage(`Failed to check connector config.  ${err.message} `);
    } finally {
      setCheckingConfigs(false);
    }
  }, [fetchConnectorConfig]);

  // Fetch connectors from API
  const fetchConnectorStatuses = useCallback(async () => {
    setIsLoading(true);
    try {
      // API call to get current connectors status
      checkConnectorConfigurations();
      const response = await axios.get('/api/v1/connectors/status');
      const { data } = response;

      // Initialize status objects
      const enabledMap: ConnectorStatusMap = {};
      // Process data from API
      if (data) {
        data.forEach((connector: any) => {
          enabledMap[connector.id] = Boolean(connector.isEnabled);
        });
      }

      setConnectorStatus(enabledMap);

      // After setting the status, check configurations to ensure they're up to date
    } catch (err) {
      console.error('Failed to fetch connectors:', err);
      setErrorMessage(`Failed to load connector settings  ${err.message} `);
    } finally {
      setIsLoading(false);
    }
  }, [checkConnectorConfigurations]);

  useEffect(() => {
    // Initialize connector statuses
    const initialStatus: ConnectorStatusMap = {};
    CONNECTORS_LIST.forEach((connector) => {
      initialStatus[connector.id] = false;
    });
    setConnectorStatus(initialStatus);
    setConfiguredStatus(initialStatus);

    // Fetch existing connector statuses from the backend
    fetchConnectorStatuses();
  }, [fetchConnectorStatuses]);

  // Check configurations when lastConfigured changes
  useEffect(() => {
    const checkConfigurations = async () => {
      setCheckingConfigs(true);
      try {
        // Check all configurations in parallel
        const results = await Promise.allSettled([fetchConnectorConfig('googleWorkspace')]);

        const googleConfigured = results[0].status === 'fulfilled' && results[0].value.isConfigured;

        const newConfigStatus = {
          googleWorkspace: googleConfigured,
        };

        setConfiguredStatus(newConfigStatus);
      } catch (err) {
        console.error('Error checking connector configurations:', err);
        setErrorMessage(`Failed to check connector config  ${err.message} `);
      } finally {
        setCheckingConfigs(false);
      }
    };

    // Call the function to check configurations
    checkConfigurations();
  }, [lastConfigured, fetchConnectorConfig]);

  // Handle toggling connectors
  const handleToggleConnector = async (connectorId: string) => {
    // Don't allow enabling unconfigured connectors
    if (!configuredStatus[connectorId] && !connectorStatus[connectorId]) {
      setErrorMessage(
        `${getConnectorTitle(connectorId)} needs to be configured before it can be enabled`
      );
      return;
    }

    const newStatus = !connectorStatus[connectorId];
    setIsLoading(true);
    try {
      if (connectorId === 'googleWorkspace') {
        if (newStatus) {
          const response = await axios.post(`/api/v1/connectors/enable`, null, {
            params: {
              service: connectorId,
            },
          });
        } else {
          const response = await axios.post(`/api/v1/connectors/disable`, null, {
            params: {
              service: connectorId,
            },
          });
        }
        // Update local state
        setConnectorStatus((prev) => ({
          ...prev,
          [connectorId]: newStatus,
        }));

        // Show success message
        setSuccessMessage(
          `${getConnectorTitle(connectorId)} ${newStatus ? 'enabled' : 'disabled'} successfully`
        );
      }
      setSuccess(true);
      connectorStatus[connectorId] = newStatus;
    } catch (err) {
      console.error('Failed to update connector status:', err);
      setErrorMessage(`Failed to update connector status. Please try again.  ${err.message} `);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening the configure dialog
  const handleConfigureConnector = (connectorId: string) => {
    setCurrentConnector(connectorId);
    setLastConfigured(connectorId); // Track which connector is being configured
    setConfigDialogOpen(true);
  };

  // Handle save in configure dialog
  const handleSaveConfiguration = () => {
    // Display appropriate success message
    const connectorTitle = currentConnector ? getConnectorTitle(currentConnector) : 'Connector';
    setSuccessMessage(`${connectorTitle} configured successfully`);
    setConfigDialogOpen(false);
    setCurrentConnector(null);
    setSuccess(true);

    // Update configured status
    if (currentConnector) {
      setConfiguredStatus((prev) => ({
        ...prev,
        [currentConnector]: true,
      }));
    }

    // Refresh connector statuses to get latest from server
    fetchConnectorStatuses();
  };

  // Helper to get connector title from ID
  const getConnectorTitle = (connectorId: string): string => {
    const connector = CONNECTORS_LIST.find((c) => c.id === connectorId);
    return connector?.title || 'Connector';
  };

  // Helper to get connector info from ID
  const getConnectorInfo = (connectorId: string): ConnectorConfig | undefined =>
    CONNECTORS_LIST.find((c) => c.id === connectorId);

  // Handle close for success message
  const handleCloseSuccess = () => {
    setSuccess(false);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Paper
        elevation={0}
        sx={{
          overflow: 'hidden',
          position: 'relative',
          p: { xs: 2, md: 3 },
          borderRadius: 1,
          border: '1px solid',
          borderColor: theme.palette.divider,
          backgroundColor: theme.palette.mode === 'dark' 
            ? alpha(theme.palette.background.paper, 0.6)
            : theme.palette.background.paper,
        }}
      >
        {/* Loading overlay */}
        {isLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: alpha(theme.palette.background.paper, 0.7),
              backdropFilter: 'blur(4px)',
              zIndex: 10,
            }}
          >
            <CircularProgress size={28} />
          </Box>
        )}

        {/* Error message */}
        {errorMessage && (
          <Alert
            severity="error"
            onClose={() => setErrorMessage(null)}
            sx={{
              mb: 3,
              borderRadius: 1,
              border: 'none',
              '& .MuiAlert-icon': {
                color: theme.palette.error.main,
              },
            }}
          >
            <AlertTitle sx={{ fontWeight: 500, fontSize: '0.875rem' }}>Error</AlertTitle>
            <Typography variant="body2">{errorMessage}</Typography>
          </Alert>
        )}

        {/* Connectors Grid */}
        <Grid container spacing={2}>
          {CONNECTORS_LIST.filter((connector) => connector.id === 'googleWorkspace').map((connector) => {
            const isEnabled = connectorStatus[connector.id] || false;
            const isConfigured = configuredStatus[connector.id] || false;
            const isDisabled = !isConfigured && !isEnabled;
            const getTooltipMessage = () => {
              if (isDisabled) {
                return `${connector.title} needs to be configured before it can be enabled`;
              }
              return '';
            };

            // Determine status color and text
            const getStatusColor = () => {
              if (isEnabled) return connector.color;
              if (isConfigured) return theme.palette.warning.main;
              return theme.palette.text.disabled;
            };

            const getStatusText = () => {
              if (isEnabled) return 'Active';
              if (isConfigured) return 'Configured';
              return 'Not Configured';
            };

            return (
              <Grid item xs={12} key={connector.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: isEnabled 
                      ? alpha(connector.color, theme.palette.mode === 'dark' ? 0.2 : 0.3) 
                      : theme.palette.divider,
                    bgcolor: isEnabled 
                      ? alpha(connector.color, theme.palette.mode === 'dark' ? 0.05 : 0.03)
                      : 'transparent',
                    transition: 'all 0.15s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: theme.palette.mode === 'dark'
                        ? `0 4px 12px ${alpha('#000', 0.15)}`
                        : `0 4px 12px ${alpha(theme.palette.grey[500], 0.1)}`,
                      borderColor: alpha(connector.color, theme.palette.mode === 'dark' ? 0.3 : 0.4),
                    },
                  }}
                >
                  {/* Connector info */}
                  <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 2,
                        bgcolor: alpha(connector.color, theme.palette.mode === 'dark' ? 0.15 : 0.1),
                        color: connector.color,
                        borderRadius: 1,
                      }}
                    >
                      <img src={connector.src} alt={connector.title} width={22} height={22} />
                    </Box>

                    <Box>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          fontWeight: 600,
                          fontSize: '0.9375rem',
                        }}
                      >
                        {connector.title}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ 
                          fontSize: '0.8125rem',
                          lineHeight: 1.5 
                        }}
                      >
                        {connector.description}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Status badge */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      mr: 2,
                      px: 1,
                      py: 0.5,
                      borderRadius: 0.75,
                      bgcolor: alpha(
                        getStatusColor(), 
                        theme.palette.mode === 'dark' ? 0.15 : 0.08
                      ),
                      color: getStatusColor(),
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: 'currentColor',
                        mr: 0.5,
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.6875rem',
                      }}
                    >
                      {getStatusText()}
                    </Typography>
                  </Box>

                  <IconButton
                    size="small"
                    onClick={() => handleConfigureConnector(connector.id)}
                    sx={{
                      mr: 1.5,
                      p: 0.75,
                      color: theme.palette.text.secondary,
                      bgcolor: theme.palette.mode === 'dark' 
                        ? alpha(theme.palette.background.paper, 0.3)
                        : alpha(theme.palette.background.default, 0.8),
                      border: '1px solid',
                      borderColor: theme.palette.divider,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
                        color: theme.palette.primary.main,
                      },
                    }}
                    aria-label={`Configure ${connector.title}`}
                  >
                    <Iconify icon={settingsIcon} width={18} height={18} />
                  </IconButton>

                  <Tooltip
                    title={getTooltipMessage()}
                    placement="top"
                    arrow
                    disableHoverListener={!isDisabled}
                  >
                    <div> {/* Wrapper div needed for disabled elements */}
                      <Switch
                        checked={isEnabled}
                        onChange={() => handleToggleConnector(connector.id)}
                        disabled={isDisabled}
                        color="primary"
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': {
                            color: connector.color,
                            '&:hover': {
                              backgroundColor: alpha(connector.color, theme.palette.mode === 'dark' ? 0.15 : 0.1),
                            },
                          },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                            backgroundColor: connector.color,
                          },
                          '& .MuiSwitch-track': {
                            opacity: 0.8,
                          },
                        }}
                      />
                    </div>
                  </Tooltip>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Info box */}
        <Box
          sx={{
            mt: 3,
            p: 2.5,
            borderRadius: 1,
            bgcolor: theme.palette.mode === 'dark' 
              ? alpha(theme.palette.info.main, 0.08)
              : alpha(theme.palette.info.main, 0.04),
            border: `1px solid ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.2 : 0.1)}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
          }}
        >
          <Box sx={{ color: theme.palette.info.main, mt: 0.5 }}>
            <Iconify icon={infoIcon} width={18} height={18} />
          </Box>
          <Box>
            <Typography 
              variant="subtitle2" 
              color="text.primary" 
              sx={{ 
                mb: 0.5, 
                fontWeight: 600,
                fontSize: '0.875rem' 
              }}
            >
              Google Workspace Configuration
            </Typography>
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{
                fontSize: '0.8125rem',
                lineHeight: 1.5,
                mb: 1
              }}
            >
              Connectors must be properly configured before they can be enabled. Click the settings
              icon to set up the necessary credentials and authentication for each service. Once
              configured, you can enable or disable the connector as needed.
            </Typography>
            <Box 
              sx={{ 
                p: 1.5,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.04),
                border: `1px solid ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1)}`,
              }}
            >
              <Typography 
                variant="body2" 
                sx={{ 
                  color: theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.main,
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  lineHeight: 1.5
                }}
              >
                Important: To configure Google Workspace integration, you need to upload your Service
                credentials JSON file from the{' '}
                <Link
                  href="https://console.cloud.google.com/iam-admin/serviceaccounts/ "
                  target="_blank"
                  rel="noopener"
                  sx={{ 
                    fontWeight: 600,
                    color: 'inherit',
                    textDecoration: 'none',
                    borderBottom: '1px dotted',
                    '&:hover': {
                      borderBottom: '1px solid',
                    }
                  }}
                >
                  Google Cloud Console
                </Link>
                .
              </Typography>
            </Box>
          </Box>
        </Box>
        
        <ConnectorStatistics connectorNames={connectorNames}/>
      </Paper>

      {/* Configure Connector Dialog */}
      <ConfigureConnectorDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        onSave={handleSaveConfiguration}
        onFileRemoved={handleFileRemoved}
        connectorType={currentConnector}
        isEnabled={connectorStatus[currentConnector || 'googleWorkspace']}
      />

      {/* Success snackbar */}
      <Snackbar
        open={success}
        autoHideDuration={4000}
        onClose={handleCloseSuccess}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ 
          mb: 2,
          mr: 2,
          zIndex: 9999
        }}
      >
        <Alert
          onClose={handleCloseSuccess}
          severity="success"
          variant="filled"
          sx={{
            width: '100%',
            boxShadow: theme.palette.mode === 'dark'
              ? '0px 3px 8px rgba(0, 0, 0, 0.3)'
              : '0px 3px 8px rgba(0, 0, 0, 0.12)',
            '& .MuiAlert-icon': {
              opacity: 0.8,
            },
            fontSize: '0.8125rem',
          }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default GoogleWorkspaceBusinessPage;