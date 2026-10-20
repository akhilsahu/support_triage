import React from 'react';

export type ColouredIconSize = '1x' | '2x' | '3x' | '4x' | '5x';

export interface ColouredIconProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * The icon identifier, e.g. "spotify", "instagram", "youtube", "linkedin", "x", "github"
   * (can be prefixed with "ci-" or plain name).
   */
  name: string;
  /**
   * Optional size modifier. Defaults to normal 1rem size if omitted.
   */
  size?: ColouredIconSize;
  /**
   * Optional custom classes (e.g. inline-block, shrink-0, etc.)
   */
  className?: string;
}

/**
 * ColouredIcon component
 * Wrapper for the Coloured Icons CSS library (served via CDN).
 * Renders brand, animal, technology, and tool logos using the `ci ci-<name>` class.
 */
export const ColouredIcon: React.FC<ColouredIconProps> = ({
  name,
  size,
  className = '',
  ...rest
}) => {
  const normalizedName = name.startsWith('ci-') ? name.slice(3) : name;
  const sizeClass = size ? `ci-${size}` : '';

  return (
    <i
      className={`ci ci-${normalizedName} ${sizeClass} inline-block shrink-0 align-middle ${className}`.trim()}
      aria-hidden="true"
      {...rest}
    />
  );
};

/**
 * Resolves a well-known brand or platform name from a given URL or reference string.
 * Returns the matching Coloured Icon name, or null if no brand match is found.
 */
export function getBrandIconFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();

  // Social & Content Platforms
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'x';
  if (lower.includes('spotify.com')) return 'spotify';
  if (lower.includes('github.com')) return 'github';
  if (lower.includes('discord.com') || lower.includes('discord.gg')) return 'discord';
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('reddit.com')) return 'reddit';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('threads.net')) return 'threads';
  if (lower.includes('medium.com')) return 'medium';
  if (lower.includes('twitch.tv')) return 'twitch';
  if (lower.includes('pinterest.com')) return 'pinterest';
  if (lower.includes('telegram.org') || lower.includes('t.me')) return 'telegram';
  if (lower.includes('whatsapp.com')) return 'whatsapp';

  // Financial & Commerce Platforms
  if (lower.includes('amazon.')) return 'amazon';
  if (lower.includes('stripe.com')) return 'stripe';
  if (lower.includes('paypal.com')) return 'paypal';
  if (lower.includes('razorpay.com')) return 'razorpay';
  if (lower.includes('phonepe.com')) return 'phonepe';
  if (lower.includes('paytm.com')) return 'paytm';

  // Major Tech & Workspace Platforms
  if (lower.includes('google.com')) return 'google';
  if (lower.includes('apple.com')) return 'apple';
  if (lower.includes('figma.com')) return 'figma';
  if (lower.includes('notion.so') || lower.includes('notion.site')) return 'notion';
  if (lower.includes('slack.com')) return 'slack';
  if (lower.includes('airbnb.')) return 'airbnb';

  return null;
}
