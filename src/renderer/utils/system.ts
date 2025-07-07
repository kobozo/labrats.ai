/**
 * System utilities for interacting with the host OS
 */
import React from 'react';

/**
 * Opens a URL in the user's default system browser
 * @param url - The URL to open
 * @returns Promise that resolves when the operation completes
 */
export const openExternalLink = async (url: string): Promise<void> => {
  try {
    const result = await window.electronAPI?.openExternal?.(url);
    if (result && !result.success) {
      console.error('Failed to open external link:', result.error);
    }
  } catch (error) {
    console.error('Error opening external link:', error);
  }
};

/**
 * React component for external links that open in system browser
 */
export const ExternalLinkButton: React.FC<{
  url: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ url, children, className, title }) => {
  return React.createElement('button', {
    onClick: () => openExternalLink(url),
    className,
    title
  }, children);
};