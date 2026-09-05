import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuthForm } from "../useAuthForm";
import { Brand } from "./components/Common";
import { plans } from "./content";
import { trackLanding } from "./analytics";
import { suggestSlug } from "./slug";
import { AuthArtwork } from "./components/AuthArtwork";
import "./auth5.css";

export function AuthPage5() {
  const auth = useAuthForm({
    onRegistered: () => trackLanding("signup_completed"),
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [editedSlug, setEditedSlug] = useState(false);
  const submitting = useRef(false);
  const started = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (auth.error)
      formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [auth.error]);
  useEffect(() => setShowPassword(false), [auth.tab]);
  const registering = auth.tab === "register";
  const selectedPlan = plans.find(
    (plan) => plan.id === new URLSearchParams(location.search).get("plan"),
  );
  const changeMode = () => {
    auth.setError("");
    const params = new URLSearchParams(location.search);
    params.set("tab", registering ? "login" : "register");
    navigate(`/app/login?${params}`);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      await (registering
        ? auth.handleRegister(event)
        : auth.handleLogin(event));
    } finally {
      submitting.current = false;
      formRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
    }
  };
  const password = registering ? auth.regPassword : auth.password;
  const setPassword = registering ? auth.setRegPassword : auth.setPassword;
  return (
    <div className="homepage5 h5-auth" data-mode={auth.tab}>
      <header className="h5-auth-nav">
        <Brand />
        <Link to="/" className="h5-text-button">
          <ArrowLeft size={16} />
          Back to home
        </Link>
      </header>
      <main className="h5-auth-grid">
        <aside className="h5-auth-story">
          <p className="h5-eyebrow">
            <Sparkles size={14} /> A LITTLE HELP. A LOT MORE POSSIBILITY.
          </p>
          <h2>
            More helpful answers.
            <br />
            <span>More human moments.</span>
          </h2>
          <p className="h5-auth-description">
            Make space for the conversations that matter. Let your knowledge
            help with the everyday questions.
          </p>
          <AuthArtwork />
          <ul>
            {[
              "Add your own business content",
              "Test answers before publishing",
              "Bring your team into the conversation",
            ].map((text) => (
              <li key={text}>
                <Check size={17} />
                {text}
              </li>
            ))}
          </ul>
          <Link to="/security">
            Learn about security and data handling <ArrowRight size={15} />
          </Link>
        </aside>
        <section className="h5-auth-form-panel" aria-labelledby="h5-auth-title">
          <div className="h5-auth-form-content">
            <div className="h5-auth-form-icon" aria-hidden="true">
              <ShieldCheck size={25} />
            </div>
            <p className="h5-eyebrow">
              {registering ? "LET’S MAKE IT YOURS" : "WELCOME BACK"}
            </p>
            <h1 id="h5-auth-title">
              {registering
                ? "Create your account."
                : "Sign in to your workspace."}
            </h1>
            <p className="h5-auth-description">
              {registering
                ? "Next, verify your email and add your content."
                : "Your conversations and knowledge, all in one place."}
            </p>
            {registering && selectedPlan && (
              <div className="h5-plan-context">
                <strong>
                  {selectedPlan.name} · ${selectedPlan.price} USD/month
                </strong>
                <span>
                  Account setup only. Contact our team to activate your paid
                  plan.
                </span>
              </div>
            )}
            <form
              aria-busy={auth.loading}
              ref={formRef}
              onSubmit={submit}
              onChange={() => {
                if (registering && !started.current) {
                  started.current = true;
                  trackLanding("signup_started");
                }
              }}
            >
              {auth.error && (
                <div className="h5-form-error" role="alert" tabIndex={-1}>
                  {auth.error}
                </div>
              )}
              <fieldset disabled={auth.loading} className="h5-auth-fields">
                <legend className="sr-only">
                  {registering
                    ? "Account and workspace details"
                    : "Sign in details"}
                </legend>
                <label className="h5-field" htmlFor="h5-email">
                  <span>Email</span>
                  <input
                    id="h5-email"
                    name="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    type="email"
                    autoComplete="email"
                    required
                    value={registering ? auth.regEmail : auth.email}
                    onChange={(e) =>
                      (registering ? auth.setRegEmail : auth.setEmail)(
                        e.target.value,
                      )
                    }
                    placeholder="you@company.com"
                  />
                </label>
                <div className="h5-field">
                  <label htmlFor="h5-password">Password</label>
                  <div className="h5-password-field">
                    <input
                      id="h5-password"
                      name="password"
                      placeholder={
                        registering
                          ? "Create a password"
                          : "Enter your password"
                      }
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        registering ? "new-password" : "current-password"
                      }
                      required
                      minLength={registering ? 8 : undefined}
                      aria-describedby={
                        registering ? "h5-password-help" : undefined
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-controls="h5-password"
                      aria-pressed={showPassword}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {registering && (
                    <span id="h5-password-help" className="h5-field-help">
                      Use at least 8 characters.
                    </span>
                  )}
                </div>
                {registering ? (
                  <>
                    <label className="h5-field" htmlFor="h5-workspace-name">
                      <span>Workspace name</span>
                      <input
                        id="h5-workspace-name"
                        name="organization"
                        autoComplete="organization"
                        required
                        value={auth.displayName}
                        onChange={(e) => {
                          auth.setDisplayName(e.target.value);
                          if (!editedSlug)
                            auth.setSlug(suggestSlug(e.target.value));
                        }}
                        placeholder="Your company"
                      />
                    </label>
                    <div className="h5-field">
                      <label htmlFor="h5-workspace-address">
                        Workspace address
                      </label>
                      <span className="h5-address">
                        <span>support247.chat/</span>
                        <input
                          id="h5-workspace-address"
                          name="workspace-address"
                          placeholder="your-company"
                          autoCapitalize="none"
                          spellCheck={false}
                          autoComplete="off"
                          required
                          maxLength={40}
                          value={auth.slug}
                          onChange={(e) => {
                            setEditedSlug(true);
                            auth.setSlug(e.target.value.toLowerCase());
                          }}
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          aria-describedby="h5-address-help"
                        />
                      </span>
                      <span id="h5-address-help" className="h5-field-help">
                        Up to 40 lowercase letters, numbers, and single hyphens.
                        You can edit the suggestion.
                      </span>
                    </div>
                  </>
                ) : (
                  <Link to="/app/forgot-password" className="h5-forgot">
                    Forgot password?
                  </Link>
                )}
                <button
                  className="h5-button h5-submit"
                  type="submit"
                  disabled={auth.loading}
                >
                  {auth.loading ? (
                    <>
                      <Loader2 className="h5-loading" size={17} />
                      {registering ? "Creating your account…" : "Signing in…"}
                    </>
                  ) : (
                    <>
                      {registering ? "Create your account" : "Sign in"}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </fieldset>
              {registering && (
                <p className="h5-auth-legal">
                  By creating an account, you agree to our{" "}
                  <Link to="/terms">Terms</Link> and acknowledge our{" "}
                  <Link to="/privacy">Privacy Policy</Link>.
                </p>
              )}
            </form>
            <p className="h5-auth-switch">
              {registering ? "Already have an account?" : "New to Support247?"}{" "}
              <button
                type="button"
                onClick={changeMode}
                disabled={auth.loading}
              >
                {registering ? "Sign in" : "Create your account"}
              </button>
            </p>
          </div>
        </section>
      </main>
      <footer className="h5-auth-footer">
        <span>Support that feels a little more human.</span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Help</Link>
        </nav>
      </footer>
    </div>
  );
}
