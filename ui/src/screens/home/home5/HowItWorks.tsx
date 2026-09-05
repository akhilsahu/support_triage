import { Navigate, useLocation } from 'react-router-dom'
export function HowItWorks5() {
  const { search } = useLocation()
  return <Navigate to={`/${search}#how-it-works`} replace />
}
