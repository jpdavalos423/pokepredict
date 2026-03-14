import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return <input className={cn('ui-input', className)} {...props} />;
}
