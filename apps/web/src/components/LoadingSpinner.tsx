interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}
 
const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-7 h-7 border-[3px]',
  lg: 'w-11 h-11 border-4',
};
 
export function LoadingSpinner({ size = 'md', fullPage = false }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={`
        rounded-full animate-spin
        border-[#FEF0E7] border-t-[#E8631A]
        ${sizeClasses[size]}
      `}
    />
  );
 
  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
        {spinner}
      </div>
    );
  }
 
  return spinner;
}
 
export default LoadingSpinner;
 