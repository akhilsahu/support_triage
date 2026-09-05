export const ease = [0.23, 1, 0.32, 1] as const // strong ease-out
export const transition = { duration: 0.2, ease }
export const revealTransition = { duration: 0.3, ease }
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    }
  }
}
export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } }
}
