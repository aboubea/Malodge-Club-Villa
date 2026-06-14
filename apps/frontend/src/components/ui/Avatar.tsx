import { HTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { getInitials } from '../../lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  size?: AvatarSize;
  alt?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, firstName = '', lastName = '', size = 'md', alt, className, ...props }, ref) => {
    const [imgError, setImgError] = useState(false);
    const initials = getInitials(firstName || '?', lastName || '');

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-full overflow-hidden shrink-0',
          'bg-[#1A1A1D] border border-[#242428]',
          'flex items-center justify-center',
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {src && !imgError ? (
          <img
            src={src}
            alt={alt || `${firstName} ${lastName}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="font-medium text-[#C9A96E]">{initials}</span>
        )}
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';
