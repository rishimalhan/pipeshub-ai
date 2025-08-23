import { Helmet } from 'react-helmet-async';

import { AuthenticationView } from 'src/auth/view/auth';

// ----------------------------------------------------------------------

const metadata = { title: 'Sign in' };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title} </title>
      </Helmet>
      <AuthenticationView />
    </>
  );
}
