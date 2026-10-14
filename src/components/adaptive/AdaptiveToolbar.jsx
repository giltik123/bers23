import React from 'react';

export default function AdaptiveToolbar({ children, className = '' }) {
  return <div className={['flex w-full flex-wrap items-center gap-1.5 sm:w-auto', className].join(' ')}>{children}</div>;
}
