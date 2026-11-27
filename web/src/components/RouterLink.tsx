import { forwardRef, type ComponentProps } from 'react'
import { Link } from '@tanstack/react-router'

/**
 * Adapter so Astryx components that render links (`href`) navigate through
 * TanStack Router. External, hash and protocol links stay plain anchors.
 */
export const RouterLink = forwardRef<HTMLAnchorElement, ComponentProps<'a'>>(function RouterLink({ href, ...rest }, ref) {
  if (!href || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href) || rest.target === '_blank') {
    return <a ref={ref} href={href} {...rest} />
  }
  // Keep query strings intact (e.g. /backups?status=failed).
  return <Link ref={ref} to={href as never} {...(rest as object)} />
})
