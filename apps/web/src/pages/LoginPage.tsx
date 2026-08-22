import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Card,
  Form,
  InputGroup,
  Spinner,
} from 'react-bootstrap';
import { APP_NAME, APP_TAGLINE, COMPANY_NAME, LoginSchema, ROLES, type LoginInput } from '@stap/shared';
import { useAuth } from '../context/AuthContext';
import type { AxiosError } from 'axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const emailRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  // Auto-focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate(user?.role === ROLES.CLIENT ? '/portal' : '/dashboard', { replace: true });
  }, [isAuthenticated, navigate, user]);

  const { ref: emailFormRef, ...emailRest } = register('email');

  const onSubmit = async (values: LoginInput) => {
    setApiError(null);
    setIsLocked(false);

    try {
      const loggedInUser = await login(values.email, values.password);
      navigate((loggedInUser as any)?.role === ROLES.CLIENT ? '/portal' : '/dashboard', { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string }>;
      if (axiosErr.response?.status === 423) {
        setIsLocked(true);
      } else {
        // Fall back to the axios message so a request that never reached the
        // API ("Network Error", a timeout) says so, rather than being reported
        // as a rejected login.
        setApiError(
          axiosErr.response?.data?.error
          ?? axiosErr.message
          ?? 'Login failed. Please try again.',
        );
      }
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ background: '#F2F4F7' }}
    >
      <div style={{ width: '100%', maxWidth: 420 }} className="px-3">
        <Card className="shadow-sm border-0">
          <Card.Header className="text-center py-4 bg-white border-0">
            <h4 className="mb-1 fw-bold" style={{ color: '#1B3A6B' }}>
              {APP_NAME}
            </h4>
            <p className="text-muted mb-0 small">{APP_TAGLINE}</p>
          </Card.Header>

          <Card.Body className="px-4 py-4">
            <Form noValidate onSubmit={handleSubmit(onSubmit)}>
              {/* Email */}
              <Form.Group className="mb-3" controlId="email">
                <Form.Label>Email Address</Form.Label>
                <Form.Control
                  type="email"
                  placeholder="you@stapsecurity.co.ug"
                  isInvalid={!!errors.email}
                  disabled={isSubmitting}
                  {...emailRest}
                  ref={(el) => {
                    emailFormRef(el);
                    (emailRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                  }}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.email?.message}
                </Form.Control.Feedback>
              </Form.Group>

              {/* Password */}
              <Form.Group className="mb-3" controlId="password">
                <Form.Label>Password</Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    isInvalid={!!errors.password}
                    disabled={isSubmitting}
                    {...register('password')}
                  />
                  <Button
                    variant="outline-secondary"
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁'}
                  </Button>
                  <Form.Control.Feedback type="invalid">
                    {errors.password?.message}
                  </Form.Control.Feedback>
                </InputGroup>
              </Form.Group>

              {/* Remember me */}
              <Form.Group className="mb-4" controlId="rememberMe">
                <Form.Check type="checkbox" label="Remember me" disabled={isSubmitting} />
              </Form.Group>

              {/* Error alerts */}
              {isLocked && (
                <Alert variant="danger" className="py-2 small">
                  Your account has been locked after too many failed attempts. Please contact your
                  administrator.
                </Alert>
              )}
              {apiError && !isLocked && (
                <Alert variant="danger" className="py-2 small">
                  ⚠️ {apiError}
                </Alert>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-100"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                      className="me-2"
                    />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </Form>
          </Card.Body>

          <Card.Footer className="text-center text-muted small py-3 bg-white border-0">
            &copy; 2026 {COMPANY_NAME}
          </Card.Footer>
        </Card>
      </div>
    </div>
  );
}
