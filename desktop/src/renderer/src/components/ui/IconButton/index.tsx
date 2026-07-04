import Button, { type ButtonProps, type ButtonSize } from '../Button';

export interface IconButtonProps extends Omit<ButtonProps, 'variant'> {
  'aria-label': string;
  size?: ButtonSize;
}

export default function IconButton({
  children,
  size = 'md',
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant="icon"
      size={size}
      className={['min-w-[32px] min-h-[32px]', className].join(' ')}
      {...props}
    >
      {children}
    </Button>
  );
}
