import { Navigate, useLocation } from 'react-router-dom'
export function Pricing5() {
  const { search } = useLocation()
  return <Navigate to={`/${search}#pricing`} replace />
}
