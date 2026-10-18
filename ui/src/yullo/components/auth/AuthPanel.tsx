import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GoogleAuthButton } from './GoogleAuthButton'
import { PhoneForm } from './PhoneForm'
import { PhoneOtpForm } from './PhoneOtpForm'
import { EmailForm } from './EmailForm'
import { EmailOtpForm } from './EmailOtpForm'
import { AuthTransition } from './AuthTransition'
import { API_CONFIG } from '../../../config/api'
import { yulloApiClient } from '../../api/client'
import { useYulloAppStore } from '../../store/useYulloAppStore'

export type AuthStep = 'identity' | 'phone-otp' | 'email' | 'email-otp' | 'success'

interface AuthPanelProps {
  onAuthSuccess: (isNewUser: boolean) => void
  isMobile?: boolean
}

export function AuthPanel({ onAuthSuccess, isMobile }: AuthPanelProps) {
  const [step, setStep] = useState<AuthStep>('identity')
  const [phoneData, setPhoneData] = useState<{ phone: string; countryCode: string }>({ phone: '', countryCode: '+91' })
  const [emailData, setEmailData] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isNewUser, setIsNewUser] = useState<boolean>(false)

  const { setAuth } = useYulloAppStore()

  // Google OAuth Success Handler
  const handleGoogleSuccess = async (googleUser: { google_sub: string; email: string; name?: string }) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const { data } = await yulloApiClient.post('/auth/google', googleUser)

      setAuth(data.user, data.csrf_token)
      setIsNewUser(data.is_new_user)
      setStep('success')
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Google login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Submit Phone -> Send OTP
  const handlePhoneSubmit = async (data: { phone: string; countryCode: string }) => {
    setLoading(true)
    setErrorMessage('')
    setPhoneData(data)
    try {
      await yulloApiClient.post('/auth/phone/send-otp', { 
        phone: data.phone, 
        country_code: data.countryCode 
      })

      setStep('phone-otp')
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Could not send verification code.')
    } finally {
      setLoading(false)
    }
  }

  // Verify Phone OTP
  const handleVerifyPhoneOtp = async (code: string) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const { data } = await yulloApiClient.post('/auth/phone/verify-otp', {
        phone: phoneData.phone,
        code,
        country_code: phoneData.countryCode,
      })

      setAuth(data.user, data.csrf_token)
      setIsNewUser(data.is_new_user)
      setStep('success')
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Submit Email -> Send OTP
  const handleEmailSubmit = async (email: string) => {
    setLoading(true)
    setErrorMessage('')
    setEmailData(email)
    try {
      await yulloApiClient.post('/auth/email/send-otp', { email })

      setStep('email-otp')
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Could not send email sign-in code.')
    } finally {
      setLoading(false)
    }
  }

  // Verify Email OTP
  const handleVerifyEmailOtp = async (code: string) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const { data } = await yulloApiClient.post('/auth/email/verify-otp', { email: emailData, code })

      setAuth(data.user, data.csrf_token)
      setIsNewUser(data.is_new_user)
      setStep('success')
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || err.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isMobile) {
    return (
      <div className="w-full flex flex-col justify-between items-center flex-1">
        <div className="w-full max-w-[420px] py-4">
          <AnimatePresence mode="wait">
            {step === 'success' ? (
              <AuthTransition
                key="success"
                isNewUser={isNewUser}
                onComplete={() => onAuthSuccess(isNewUser)}
              />
            ) : (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.22 }}
                className="w-full"
              >
                {(step === 'identity' || step === 'email') && (
                  <div className="mb-6">
                    <h2
                      className="text-2xl font-bold text-[#0B1220] tracking-tight leading-tight"
                      style={{ fontFamily: 'Satoshi, sans-serif' }}
                    >
                      Continue to Yullo
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 font-normal">
                      Sign in or create your account.
                    </p>
                  </div>
                )}

                {step === 'identity' && (
                  <>
                    <GoogleAuthButton
                      onSuccess={handleGoogleSuccess}
                      onError={(msg) => setErrorMessage(msg)}
                      loading={loading}
                    />
                    <div className="relative my-5 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200/80" />
                      </div>
                      <span className="relative bg-white px-3 text-xs text-slate-400 font-medium lowercase">
                        or
                      </span>
                    </div>
                    <PhoneForm
                      onSubmit={handlePhoneSubmit}
                      onSwitchToEmail={() => {
                        setErrorMessage('')
                        setStep('email')
                      }}
                      loading={loading}
                      errorMessage={errorMessage}
                    />
                  </>
                )}

                {step === 'phone-otp' && (
                  <PhoneOtpForm
                    phoneFormatted={`${phoneData.countryCode} ${phoneData.phone}`}
                    onSubmit={handleVerifyPhoneOtp}
                    onResend={() => handlePhoneSubmit(phoneData)}
                    onChangeNumber={() => {
                      setErrorMessage('')
                      setStep('identity')
                    }}
                    loading={loading}
                    errorMessage={errorMessage}
                  />
                )}

                {step === 'email' && (
                  <EmailForm
                    onSubmit={handleEmailSubmit}
                    onSwitchToPhone={() => {
                      setErrorMessage('')
                      setStep('identity')
                    }}
                    loading={loading}
                    errorMessage={errorMessage}
                  />
                )}

                {step === 'email-otp' && (
                  <EmailOtpForm
                    email={emailData}
                    onSubmit={handleVerifyEmailOtp}
                    onResend={() => handleEmailSubmit(emailData)}
                    onChangeEmail={() => {
                      setErrorMessage('')
                      setStep('email')
                    }}
                    loading={loading}
                    errorMessage={errorMessage}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full text-center pt-6 pb-2 border-t border-slate-100 mt-auto">
          <p className="text-xs text-slate-500 font-normal leading-relaxed">
            By continuing, you agree to Yullo’s{' '}
            <a href="/terms" className="text-slate-700 underline underline-offset-2 hover:text-[#0B1220]">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-slate-700 underline underline-offset-2 hover:text-[#0B1220]">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-[100dvh] bg-white border-l border-slate-900/[0.06] flex flex-col justify-between items-center overflow-y-auto">
      {/* Top spacer helper */}
      <div className="relative z-10 h-6 shrink-0 pointer-events-none" />

      {/* Desktop Inner Form Stack with bounded clamp() spacing */}
      <div
        className="relative z-10 my-auto py-4"
        style={{
          width: 'min(420px, calc(100% - 48px))',
          marginInline: 'auto',
          marginTop: 'clamp(12px, 3vh, 44px)',
        }}
      >
        <AnimatePresence mode="wait">
          {step === 'success' ? (
            <AuthTransition
              key="success"
              isNewUser={isNewUser}
              onComplete={() => onAuthSuccess(isNewUser)}
            />
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {/* Header section for main identity step */}
              {(step === 'identity' || step === 'email') && (
                <div className="mb-8">
                  <h2
                    className="text-2xl sm:text-3xl font-bold text-[#0B1220] tracking-tight leading-tight"
                    style={{ fontFamily: 'Satoshi, sans-serif' }}
                  >
                    Continue to Yullo
                  </h2>
                  <p className="mt-1.5 text-sm sm:text-base text-slate-500 font-normal">
                    Sign in or create your account.
                  </p>
                </div>
              )}

              {/* Step 1: Main Identity (Google + Phone) */}
              {step === 'identity' && (
                <>
                  <GoogleAuthButton
                    onSuccess={handleGoogleSuccess}
                    onError={(msg) => setErrorMessage(msg)}
                    loading={loading}
                  />

                  {/* Divider */}
                  <div className="relative my-6 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200/80" />
                    </div>
                    <span className="relative bg-white px-3 text-xs text-slate-400 font-medium lowercase">
                      or
                    </span>
                  </div>

                  <PhoneForm
                    onSubmit={handlePhoneSubmit}
                    onSwitchToEmail={() => {
                      setErrorMessage('')
                      setStep('email')
                    }}
                    loading={loading}
                    errorMessage={errorMessage}
                  />
                </>
              )}

              {/* Step 2: Phone OTP Verification */}
              {step === 'phone-otp' && (
                <PhoneOtpForm
                  phoneFormatted={`${phoneData.countryCode} ${phoneData.phone}`}
                  onSubmit={handleVerifyPhoneOtp}
                  onResend={() => handlePhoneSubmit(phoneData)}
                  onChangeNumber={() => {
                    setErrorMessage('')
                    setStep('identity')
                  }}
                  loading={loading}
                  errorMessage={errorMessage}
                />
              )}

              {/* Step 3: Email Input Swap */}
              {step === 'email' && (
                <EmailForm
                  onSubmit={handleEmailSubmit}
                  onSwitchToPhone={() => {
                    setErrorMessage('')
                    setStep('identity')
                  }}
                  loading={loading}
                  errorMessage={errorMessage}
                />
              )}

              {/* Step 4: Email OTP Verification */}
              {step === 'email-otp' && (
                <EmailOtpForm
                  email={emailData}
                  onSubmit={handleVerifyEmailOtp}
                  onResend={() => handleEmailSubmit(emailData)}
                  onChangeEmail={() => {
                    setErrorMessage('')
                    setStep('email')
                  }}
                  loading={loading}
                  errorMessage={errorMessage}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop Legal Footer Notice */}
      <div className="w-full text-center pt-6 pb-4 shrink-0 border-t border-slate-100">
        <p className="text-xs text-slate-500 font-normal leading-relaxed">
          By continuing, you agree to Yullo’s{' '}
          <a href="/terms" className="text-slate-700 underline underline-offset-2 hover:text-[#0B1220]">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-slate-700 underline underline-offset-2 hover:text-[#0B1220]">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
