import { ConnectorConfigLayout } from './components/connector-config-layout';
import ConfigureConnectorDialog from './components/configure-connector-company-dialog';

const SharePointConnector = () => (
  <ConnectorConfigLayout
    connectorId="sharepointOnline"
    accountType="business"
    configDialogComponent={ConfigureConnectorDialog}
    statsConnectorNames={['Sharepoint Online']}
  />
);

export default SharePointConnector;
