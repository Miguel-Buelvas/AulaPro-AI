interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function BrandLogo({ size = 'md', showText = true }: BrandLogoProps) {
  const boxSize =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const textSize =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <div
        className={`${boxSize} rounded-xl bg-[#050816] border border-[#1E293B] overflow-hidden flex items-center justify-center shrink-0`}
      >
        <img
          src="/assets/aistudio/aula_325d8394.png"
          alt="Logotipo oficial de AulaPro AI"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-0.5"
        />
      </div>
      {showText && (
        <span
          className={`${textSize} font-display font-bold tracking-tight text-[#0A1633] dark:text-white`}
        >
          AulaPro{' '}
          <span className="text-[#2563EB] dark:text-[#38BDF8]">AI</span>
        </span>
      )}
    </div>
  );
}
