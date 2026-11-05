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
import { LoginSchema, ROLES, type LoginInput } from '@security360/shared';
import { APP_NAME, APP_TAGLINE } from '../lib/branding';
import { useAuth } from '../context/AuthContext';
import type { AxiosError } from 'axios';

const NAVY = '#1B3A6B';
const STAP_IMAGES = ['/stap/P84A6216.webp', '/stap/P84A6541.webp', '/stap/P84A6604.webp'];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [slide, setSlide] = useState(0);

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

  // Looping slideshow for the side panel
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % STAP_IMAGES.length), 4000);
    return () => clearInterval(t);
  }, []);

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
        setApiError(
          axiosErr.response?.data?.error
          ?? axiosErr.message
          ?? 'Login failed. Please try again.',
        );
      }
    }
  };

  return (
    <div className="min-vh-100 d-flex" style={{ background: '#F2F4F7' }}>
      {/* Side panel — looping STAP Security artifacts */}
      <div
        className="d-none d-lg-flex flex-column justify-content-between"
        style={{
          width: '50%',
          background: NAVY,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {STAP_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="STAP Security"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: i === slide ? 1 : 0,
              transition: 'opacity 1s ease-in-out',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(27,58,107,0.35) 0%, rgba(27,58,107,0.75) 100%)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 2, padding: '2rem' }}>
          <h2 className="fw-bold text-white mb-1">{APP_NAME}</h2>
          <p className="text-white-50 mb-0 small">{APP_TAGLINE}</p>
        </div>
        <div style={{ position: 'relative', zIndex: 2, padding: '2rem' }}>
          <div className="d-flex gap-2">
            {STAP_IMAGES.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: i === slide ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Login panel */}
      <div className="d-flex align-items-center justify-content-center flex-grow-1 px-3" style={{ background: "linear-gradient(135deg, #F2F4F7 0%, #E8EDF5 100%)" }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <Card className="shadow border-0" style={{ borderRadius: 16, overflow: "hidden", animation: "fadeIn 0.6s ease-out" }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <Card.Header className="text-center py-4 bg-white border-0" style={{ borderBottom: "3px solid #1B3A6B" }}>
              <h4 className="mb-1 fw-bold" style={{ color: NAVY }}>
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
                    placeholder="you@example.com"
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
                      {showPassword ? '🙈' : '👁️'}
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
                  style={{ backgroundColor: NAVY, borderColor: NAVY }}
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

          </Card>
        </div>
      </div>
    </div>
  );
}
