import { Alert, Button, Container } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function UnauthorisedPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <Container style={{ maxWidth: 480 }}>
        <Alert variant="danger">
          <Alert.Heading>Access Denied</Alert.Heading>
          <p className="mb-3">
            You don&apos;t have permission to view this page. If you believe this is an error,
            contact your administrator.
          </p>
          <hr />
          <div className="d-flex gap-2">
            <Button variant="danger" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </Button>
            <Button variant="outline-danger" onClick={logout}>
              Sign Out
            </Button>
          </div>
        </Alert>
      </Container>
    </div>
  );
}
